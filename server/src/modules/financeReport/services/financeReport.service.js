import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StaffSalaryTransaction from "../../../models/staffSalaryTransaction.model.js";
import Group from "../../../models/group.model.js";
import DebtWriteOff from "../../../models/debtWriteOff.model.js";
import Expense from "../../../models/expense.model.js";
import { branchMatchStage, branchFilter } from "../../../helpers/branchContext.helper.js";

// === Sana yordamchilari (UTC) ===
const monthRange = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
};

const previousMonths = (count) => {
  const now = new Date();
  const arr = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

const MONTH_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

const pct = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 100) : null;

const delta = (cur, prev) =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

// Tranzaksiyalar yig'indisi (kassa asosida - paidAt oraliqda)
const sumTransactions = async (Model, start, end) => {
  const [row] = await Model.aggregate([
    // FILIAL: aggregate pre-hook'dan O'TMAYDI - $match MAJBURIY.
    ...branchMatchStage(),
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

// Kirim tranzaksiyalarini to'lov usuli bo'yicha ajratish
const sumByMethod = async (start, end) => {
  const rows = await PaymentTransaction.aggregate([
    ...branchMatchStage(),
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: "$method", total: { $sum: "$amount" } } },
  ]);
  const out = { cash: 0, card: 0 };
  for (const r of rows) if (r._id in out) out[r._id] = r.total || 0;
  return out;
};

// Hisoblangan (billed) summa, qoldiq va YOMON QARZ - oylik snapshotlar bo'yicha.
// Model: StudentPayment yoki TeacherSalary (ikkalasida ham expectedAmount/paidAmount bor).
// Write-off qilingan (yomon qarz) yozuvlar billed/paid/outstanding'dan CHIQARILADI
// va alohida badDebt sifatida jamlanadi (TeacherSalary'da writtenOff yo'q → 0).
const billedAndOutstanding = async (Model, year, month) => {
  const isWrittenOff = { $eq: [{ $ifNull: ["$writtenOff", false] }, true] };
  // BOSHLANG'ICH QOLDIQ (import orqali kiritilgan, tizimdan oldingi hisob).
  //
  // billed'dan CHIQARILADI: tizim bu summani hech qachon hisoblamagan,
  //   uni "o'sha oy hisoblangan daromad" deb ko'rsatish hisobotni yolg'on
  //   qilardi (o'sha oyda markaz bu tizimda umuman ishlamagan bo'lishi mumkin).
  // outstanding'ga KIRADI: bu haqiqiy, undiriladigan qarz - qarzdorlar
  //   ro'yxatidan tushib qolsa, hech kim uni undirmasdi.
  // paid'dan ham chiqariladi: unga qarshi kelgan pul REAL to'lov sifatida
  //   PaymentTransaction'da alohida sanaladi - ikki marta hisoblanmasin.
  const isOpening = { $eq: [{ $ifNull: ["$isOpening", false] }, true] };
  const excludeFromBilled = { $or: [isWrittenOff, isOpening] };

  const [row] = await Model.aggregate([
    ...branchMatchStage(),
    { $match: { year: Number(year), month: Number(month) } },
    {
      $group: {
        _id: null,
        billed: { $sum: { $cond: [excludeFromBilled, 0, "$expectedAmount"] } },
        paid: { $sum: { $cond: [excludeFromBilled, 0, "$paidAmount"] } },
        outstanding: {
          $sum: {
            $cond: [
              isWrittenOff,
              0,
              { $max: [{ $subtract: ["$expectedAmount", "$paidAmount"] }, 0] },
            ],
          },
        },
        badDebt: {
          $sum: {
            $cond: [isWrittenOff, { $ifNull: ["$writeOffAmount", 0] }, 0],
          },
        },
        // Ochiq ko'rsatiladi: "qoldiqning qancha qismi eski (boshlang'ich)
        // qarz?" - aks holda outstanding va billed farqi tushunarsiz bo'lardi.
        openingOutstanding: {
          $sum: {
            $cond: [
              { $and: [isOpening, { $not: isWrittenOff }] },
              { $max: [{ $subtract: ["$expectedAmount", "$paidAmount"] }, 0] },
              0,
            ],
          },
        },
      },
    },
  ]);
  return {
    billed: row?.billed || 0,
    paid: row?.paid || 0,
    outstanding: row?.outstanding || 0,
    badDebt: row?.badDebt || 0,
    openingOutstanding: row?.openingOutstanding || 0,
  };
};

// UMUMIY CHIQIMLAR (ijara, kommunal, ta'mir, reklama, jihoz, soliq).
//
// Ikki o'lchov ATAYLAB ajratilgan - ular BOSHQA savolga javob beradi:
//   cash    - `spentAt` oraliqda: "shu oy kassadan qancha pul chiqdi?"
//   accrual - `accrualYear/Month`: "shu oyga QAYSI xarajatlar tegishli?"
// Avgust ijarasini iyulda to'lasa: cash → iyul, accrual → avgust.
// Foyda hisobi accrual bo'yicha, kassa oqimi cash bo'yicha bo'lishi kerak.
//
// FILIAL: markaz umumiy chiqimlari (branchId=null) HAR DOIM qo'shiladi -
// aks holda ular hech bir filial hisobotiga tushmay, foyda sun'iy
// yuqori ko'rinardi. Aynan shu maqsadda $or ishlatiladi.
const expenseBranchMatch = () => {
  const bf = branchFilter();
  return Object.keys(bf).length ? [{ $match: { $or: [bf, { branchId: null }] } }] : [];
};

const sumExpensesCash = async (start, end) => {
  const [row] = await Expense.aggregate([
    ...expenseBranchMatch(),
    { $match: { spentAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

const sumExpensesAccrual = async (year, month) => {
  const rows = await Expense.aggregate([
    ...expenseBranchMatch(),
    {
      $match: {
        accrualYear: Number(year),
        accrualMonth: Number(month),
        isDeleted: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$categoryKind",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const byKind = { operating: 0, payroll: 0, tax: 0, capital: 0 };
  let total = 0;
  let count = 0;
  for (const r of rows) {
    if (r._id in byKind) byKind[r._id] = r.total || 0;
    total += r.total || 0;
    count += r.count || 0;
  }
  // KAPITAL chiqim foydadan DARHOL ayrilmaydi - u aktiv sotib olish.
  // Shuning uchun "foydaga ta'sir qiluvchi" summa alohida qaytariladi.
  return { total, count, byKind, expensedTotal: total - byKind.capital };
};

// === getSummary: tanlangan oy uchun asosiy ko'rsatkichlar (KPI) ===
export const getSummary = async ({ year, month } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;

  const { start, end } = monthRange(y, m);
  const prev = monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);

  const [
    incomeCash,
    incomeCashPrev,
    salaryCash,
    salaryCashPrev,
    studentBilled,
    teacherBilled,
    paymentMethods,
    opexCash,
    opexCashPrev,
    opexAccrual,
    staffSalaryCash,
    staffSalaryCashPrev,
  ] = await Promise.all([
    sumTransactions(PaymentTransaction, start, end),
    sumTransactions(PaymentTransaction, prev.start, prev.end),
    sumTransactions(SalaryTransaction, start, end),
    sumTransactions(SalaryTransaction, prev.start, prev.end),
    billedAndOutstanding(StudentPayment, y, m),
    billedAndOutstanding(TeacherSalary, y, m),
    sumByMethod(start, end),
    sumExpensesCash(start, end),
    sumExpensesCash(prev.start, prev.end),
    sumExpensesAccrual(y, m),
    // XODIMLAR MAOSHI - uchinchi chiqim manbasi. Qo'shilmasa "sof foyda"
    // haqiqiydan yuqori chiqardi (aynan ijara/kommunal bilan bo'lgan xato).
    sumTransactions(StaffSalaryTransaction, start, end),
    sumTransactions(StaffSalaryTransaction, prev.start, prev.end),
  ]);

  // ── JAMI CHIQIM ──
  // Ilgari bu yerda FAQAT maosh bor edi (SalaryTransaction), ya'ni ijara,
  // kommunal, ta'mir va reklama foydaga umuman ta'sir qilmasdi va "sof foyda"
  // haqiqiydan doim YUQORI chiqardi. Endi ikkala manba qo'shiladi.
  const expenseCashTotal =
    salaryCash.total + staffSalaryCash.total + opexCash.total;
  const expenseCashTotalPrev =
    salaryCashPrev.total + staffSalaryCashPrev.total + opexCashPrev.total;

  // ── KASSA FOYDASI (cash basis): "shu oy qancha pul qoldi?" ──
  const cashProfit = incomeCash.total - expenseCashTotal;
  const cashProfitPrev = incomeCashPrev.total - expenseCashTotalPrev;

  // ── HISOBLANGAN FOYDA (accrual basis): "shu oy qancha ISHLAB TOPDIK?" ──
  //
  // NEGA IKKALASI KERAK: o'quvchi to'lamagan bo'lsa ham dars o'tildi va
  // o'qituvchiga haq hisoblandi - bu oyning HAQIQIY natijasi. Kassa foydasi
  // esa likvidlikni ko'rsatadi. Ikkalasi ham to'g'ri, lekin BOSHQA savolga.
  //
  // Kapital chiqim (jihoz sotib olish) accrual foydadan AYRILMAYDI - u pul
  // sarfi, lekin xarajat emas (aktiv aktivga aylandi).
  const accrualExpense = teacherBilled.billed + opexAccrual.expensedTotal;
  const accrualProfit = studentBilled.billed - accrualExpense;

  return {
    period: { year: y, month: m },
    income: {
      collected: incomeCash.total,
      billed: studentBilled.billed,
      outstanding: studentBilled.outstanding,
      // Yomon qarz (write-off) - undirilmaydigan, moliyaviy zarar. Undirilishi
      // mumkin bo'lgan qoldiq (outstanding) dan alohida ko'rsatiladi.
      badDebt: studentBilled.badDebt,
      rate: pct(studentBilled.paid, studentBilled.billed),
      delta: delta(incomeCash.total, incomeCashPrev.total),
      count: incomeCash.count,
    },
    expense: {
      // JAMI (maosh + umumiy chiqimlar) - dashboard shuni ko'rsatishi kerak.
      paid: expenseCashTotal,
      delta: delta(expenseCashTotal, expenseCashTotalPrev),
      count: salaryCash.count + staffSalaryCash.count + opexCash.count,
      // Maosh qismi (eski maydonlar - orqaga moslik uchun saqlandi).
      salaryPaid: salaryCash.total,
      // Xodimlar maoshi alohida ko'rsatiladi: "maosh" qatorida
      // o'qituvchi va resepshin aralashib ketmasin.
      staffSalaryPaid: staffSalaryCash.total,
      billed: teacherBilled.billed,
      outstanding: teacherBilled.outstanding,
      rate: pct(teacherBilled.paid, teacherBilled.billed),
      // Umumiy chiqimlar qismi.
      operatingPaid: opexCash.total,
      operatingAccrued: opexAccrual.total,
      byKind: opexAccrual.byKind,
      // Kapital sarf - kassadan chiqdi, lekin foydadan ayrilmaydi.
      capital: opexAccrual.byKind.capital,
    },
    // Kassa asosidagi foyda (eski nom - frontend buzilmasligi uchun saqlandi).
    netProfit: cashProfit,
    netProfitDelta: delta(cashProfit, cashProfitPrev),
    margin: pct(cashProfit, incomeCash.total),
    // Yangi: hisoblangan (accrual) foyda - biznesning haqiqiy natijasi.
    accrual: {
      revenue: studentBilled.billed,
      expense: accrualExpense,
      profit: accrualProfit,
      margin: pct(accrualProfit, studentBilled.billed),
    },
    paymentMethods,
  };
};

// === getTrend: so'nggi N oy uchun kirim/chiqim/sof (bar chart) ===
export const getTrend = async ({ months = 12 } = {}) => {
  const periods = previousMonths(months);
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    // Trend ham JAMI chiqimni ko'rsatishi kerak - aks holda grafik va KPI
    // kartochkasi bir-biriga zid raqam ko'rsatardi.
    const [income, salary, studentBilled, opex, staffSalary] = await Promise.all([
      sumTransactions(PaymentTransaction, start, end),
      sumTransactions(SalaryTransaction, start, end),
      billedAndOutstanding(StudentPayment, p.year, p.month),
      sumExpensesCash(start, end),
      sumTransactions(StaffSalaryTransaction, start, end),
    ]);
    const expenseTotal = salary.total + staffSalary.total + opex.total;
    result.push({
      year: p.year,
      month: p.month,
      label: MONTH_SHORT[p.month - 1],
      income: income.total,
      expense: expenseTotal,
      // Chiqimning tarkibi - stacked bar uchun.
      salaryExpense: salary.total,
      staffSalaryExpense: staffSalary.total,
      operatingExpense: opex.total,
      net: income.total - expenseTotal,
      outstanding: studentBilled.outstanding,
      badDebt: studentBilled.badDebt,
    });
  }
  return result;
};

// === getWriteOffs: yomon qarzlar (hisobdan chiqarilgan) ro'yxati ===
// Hisobot ASL QARZ OYIGA bog'lanadi: year/month berilsa shu oyga tegishli
// breakdown ulushi ko'rsatiladi (bir chiqish bir nechta oyni qamrashi mumkin).
export const getWriteOffs = async ({ year, month, groupId, limit = 100 } = {}) => {
  const match = {};
  if (groupId && mongoose.isValidObjectId(groupId)) {
    match.group = new mongoose.Types.ObjectId(String(groupId));
  }
  if (year && month) {
    match.breakdown = {
      $elemMatch: { year: Number(year), month: Number(month) },
    };
  } else if (year) {
    match.breakdown = { $elemMatch: { year: Number(year) } };
  }

  const rows = await DebtWriteOff.find(match)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .lean();

  const matchAmount = (breakdown = []) => {
    if (year && month) {
      return breakdown
        .filter((b) => b.year === Number(year) && b.month === Number(month))
        .reduce((s, b) => s + (b.amount || 0), 0);
    }
    if (year) {
      return breakdown
        .filter((b) => b.year === Number(year))
        .reduce((s, b) => s + (b.amount || 0), 0);
    }
    return breakdown.reduce((s, b) => s + (b.amount || 0), 0);
  };

  const items = rows.map((r) => ({
    id: String(r._id),
    studentName: r.studentName || "Noma'lum",
    groupName: r.groupName || "-",
    // Filtrga tegishli ko'rsatiladigan summa (asl oy bo'yicha)
    amount: matchAmount(r.breakdown),
    // Hodisadagi to'liq yo'qotish (barcha oylar)
    totalAmount: r.amount || 0,
    reasonTitle: r.reasonTitle || "",
    breakdown: r.breakdown || [],
    createdAt: r.createdAt,
  }));

  const total = items.reduce((s, it) => s + it.amount, 0);
  return { items, total };
};

// GURUHGA BOG'LANMAGAN CHIQIM uchun sun'iy kalit.
//
// TeacherSalary'da `group` ATAYLAB null bo'lishi mumkin (model izohiga
// qarang): kind="base" - markaz darajasidagi fiksa oylik, kind="bonus" -
// KPI mukofoti. Ular hech qaysi guruhga tegishli emas.
//
// Ilgari shu qator BUTUN endpoint'ni yiqitardi: aggregate `_id: null`
// qaytarardi, `String(null)` = "null" bo'lib `Group.find({_id: {$in:
// [..., "null"]}})` ga tushardi va Mongoose CastError -> 400 «Noto'g'ri
// ID». Ya'ni fiksa oylikdagi BITTA o'qituvchi butun "Guruhlar kesimi"
// kartasini o'chirib qo'yardi.
const UNASSIGNED = "unassigned";

// === getGroupBreakdown: oy bo'yicha guruhlar kesimida kirim/chiqim/sof ===
export const getGroupBreakdown = async ({ year, month, limit = 8 } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;

  const [studentRows, teacherRows] = await Promise.all([
    StudentPayment.aggregate([
      ...branchMatchStage(),
      { $match: { year: y, month: m } },
      {
        $group: {
          _id: "$group",
          income: { $sum: "$paidAmount" },
          billed: { $sum: "$expectedAmount" },
        },
      },
    ]),
    TeacherSalary.aggregate([
      ...branchMatchStage(),
      { $match: { year: y, month: m } },
      { $group: { _id: "$group", expense: { $sum: "$paidAmount" } } },
    ]),
  ]);

  // `_id` null bo'lishi MUMKIN (fiksa oylik / bonus) - o'shanda sun'iy
  // kalitga tushamiz, aks holda "null" satri ObjectId deb o'qilardi.
  const keyOf = (id) => (id ? String(id) : UNASSIGNED);

  const map = new Map();
  for (const r of studentRows) {
    const id = keyOf(r._id);
    map.set(id, {
      groupId: id,
      income: r.income || 0,
      billed: r.billed || 0,
      expense: 0,
    });
  }
  for (const r of teacherRows) {
    const id = keyOf(r._id);
    const cur = map.get(id) || { groupId: id, income: 0, billed: 0, expense: 0 };
    cur.expense = r.expense || 0;
    map.set(id, cur);
  }

  const items = [...map.values()].map((it) => ({
    ...it,
    net: it.income - it.expense,
  }));

  // Guruh nomlarini biriktirish (sun'iy kalit bazaga YUBORILMAYDI)
  const ids = items.map((it) => it.groupId).filter((id) => id !== UNASSIGNED);
  const groups = await Group.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const nameById = new Map(groups.map((g) => [String(g._id), g.name]));
  for (const it of items) {
    it.groupName =
      it.groupId === UNASSIGNED
        ? "Guruhsiz (fiksa va bonus)"
        : nameById.get(it.groupId) || "Noma'lum";
  }

  // GURUHSIZ QATOR TOP RO'YXATDAN TASHQARIDA.
  //
  // Uning kirimi doim 0, ya'ni kirim bo'yicha saralashda oxirida qolardi
  // va `limit` uni jimgina kesib tashlardi. O'shanda markaz darajasidagi
  // maosh chiqimi hisobotdan butunlay yo'qolib, guruhlar yig'indisi
  // umumiy chiqimga mos kelmay qolardi.
  // Puli yo'q bo'lsa (maosh hali to'lanmagan) qator umuman qo'shilmaydi -
  // nol qiymatli chiziq faqat shovqin bo'lardi.
  const unassigned = items.find(
    (it) => it.groupId === UNASSIGNED && (it.income || it.expense),
  );
  const top = items
    .filter((it) => it.groupId !== UNASSIGNED)
    .sort((a, b) => b.income - a.income)
    .slice(0, Number(limit));

  return unassigned ? [...top, unassigned] : top;
};

// === getLedger: oy ichidagi so'nggi tranzaksiyalar (kirim + chiqim) ===
export const getLedger = async ({ year, month, limit = 12 } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const lim = Number(limit);

  const [payments, salaries, staffSalaries] = await Promise.all([
    PaymentTransaction.find({ year: y, month: m, isDeleted: { $ne: true } })
      .sort({ paidAt: -1 })
      .limit(lim)
      .populate("student", "firstName lastName")
      .populate("group", "name")
      .lean(),
    SalaryTransaction.find({ year: y, month: m, isDeleted: { $ne: true } })
      .sort({ paidAt: -1 })
      .limit(lim)
      .populate("teacher", "firstName lastName")
      .populate("group", "name")
      .lean(),
    // Xodimlar maoshi ham kassa harakati - ledger'da ko'rinmasa, egasi
    // "pul qayerga ketdi?" degan savolga javob topa olmasdi.
    StaffSalaryTransaction.find({ year: y, month: m, isDeleted: { $ne: true } })
      .sort({ paidAt: -1 })
      .limit(lim)
      .populate("employee", "firstName lastName")
      .lean(),
  ]);

  const fullName = (u) =>
    u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Noma'lum";

  const incomeItems = payments.map((r) => ({
    id: String(r._id),
    type: "income",
    name: fullName(r.student),
    groupName: r.group?.name || "-",
    category: "O'quvchi to'lovi",
    method: r.method,
    amount: r.amount,
    paidAt: r.paidAt,
  }));

  const expenseItems = salaries.map((r) => ({
    id: String(r._id),
    type: "expense",
    name: fullName(r.teacher),
    groupName: r.group?.name || "-",
    category: "O'qituvchi maoshi",
    method: r.method,
    amount: r.amount,
    paidAt: r.paidAt,
  }));

  const staffExpenseItems = staffSalaries.map((r) => ({
    id: String(r._id),
    type: "expense",
    name: fullName(r.employee),
    groupName: "-",
    category: "Xodim maoshi",
    method: r.method,
    amount: r.amount,
    paidAt: r.paidAt,
  }));

  return [...incomeItems, ...expenseItems, ...staffExpenseItems]
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
    .slice(0, lim);
};
