import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import Group from "../../../models/group.model.js";
import DebtWriteOff from "../../../models/debtWriteOff.model.js";

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
    { $match: { paidAt: { $gte: start, $lte: end }, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);
  return { total: row?.total || 0, count: row?.count || 0 };
};

// Kirim tranzaksiyalarini to'lov usuli bo'yicha ajratish
const sumByMethod = async (start, end) => {
  const rows = await PaymentTransaction.aggregate([
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
  const [row] = await Model.aggregate([
    { $match: { year: Number(year), month: Number(month) } },
    {
      $group: {
        _id: null,
        billed: { $sum: { $cond: [isWrittenOff, 0, "$expectedAmount"] } },
        paid: { $sum: { $cond: [isWrittenOff, 0, "$paidAmount"] } },
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
      },
    },
  ]);
  return {
    billed: row?.billed || 0,
    paid: row?.paid || 0,
    outstanding: row?.outstanding || 0,
    badDebt: row?.badDebt || 0,
  };
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
    expenseCash,
    expenseCashPrev,
    studentBilled,
    teacherBilled,
    paymentMethods,
  ] = await Promise.all([
    sumTransactions(PaymentTransaction, start, end),
    sumTransactions(PaymentTransaction, prev.start, prev.end),
    sumTransactions(SalaryTransaction, start, end),
    sumTransactions(SalaryTransaction, prev.start, prev.end),
    billedAndOutstanding(StudentPayment, y, m),
    billedAndOutstanding(TeacherSalary, y, m),
    sumByMethod(start, end),
  ]);

  const netProfit = incomeCash.total - expenseCash.total;
  const netProfitPrev = incomeCashPrev.total - expenseCashPrev.total;

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
      paid: expenseCash.total,
      billed: teacherBilled.billed,
      outstanding: teacherBilled.outstanding,
      rate: pct(teacherBilled.paid, teacherBilled.billed),
      delta: delta(expenseCash.total, expenseCashPrev.total),
      count: expenseCash.count,
    },
    netProfit,
    netProfitDelta: delta(netProfit, netProfitPrev),
    margin: pct(netProfit, incomeCash.total),
    paymentMethods,
  };
};

// === getTrend: so'nggi N oy uchun kirim/chiqim/sof (bar chart) ===
export const getTrend = async ({ months = 12 } = {}) => {
  const periods = previousMonths(months);
  const result = [];
  for (const p of periods) {
    const { start, end } = monthRange(p.year, p.month);
    const [income, expense, studentBilled] = await Promise.all([
      sumTransactions(PaymentTransaction, start, end),
      sumTransactions(SalaryTransaction, start, end),
      billedAndOutstanding(StudentPayment, p.year, p.month),
    ]);
    result.push({
      year: p.year,
      month: p.month,
      label: MONTH_SHORT[p.month - 1],
      income: income.total,
      expense: expense.total,
      net: income.total - expense.total,
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

// === getGroupBreakdown: oy bo'yicha guruhlar kesimida kirim/chiqim/sof ===
export const getGroupBreakdown = async ({ year, month, limit = 8 } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;

  const [studentRows, teacherRows] = await Promise.all([
    StudentPayment.aggregate([
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
      { $match: { year: y, month: m } },
      { $group: { _id: "$group", expense: { $sum: "$paidAmount" } } },
    ]),
  ]);

  const map = new Map();
  for (const r of studentRows) {
    map.set(String(r._id), {
      groupId: String(r._id),
      income: r.income || 0,
      billed: r.billed || 0,
      expense: 0,
    });
  }
  for (const r of teacherRows) {
    const id = String(r._id);
    const cur = map.get(id) || { groupId: id, income: 0, billed: 0, expense: 0 };
    cur.expense = r.expense || 0;
    map.set(id, cur);
  }

  const items = [...map.values()].map((it) => ({
    ...it,
    net: it.income - it.expense,
  }));

  // Guruh nomlarini biriktirish
  const ids = items.map((it) => it.groupId);
  const groups = await Group.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const nameById = new Map(groups.map((g) => [String(g._id), g.name]));
  for (const it of items) it.groupName = nameById.get(it.groupId) || "Noma'lum";

  items.sort((a, b) => b.income - a.income);
  return items.slice(0, Number(limit));
};

// === getLedger: oy ichidagi so'nggi tranzaksiyalar (kirim + chiqim) ===
export const getLedger = async ({ year, month, limit = 12 } = {}) => {
  const now = new Date();
  const y = year ? Number(year) : now.getUTCFullYear();
  const m = month ? Number(month) : now.getUTCMonth() + 1;
  const lim = Number(limit);

  const [payments, salaries] = await Promise.all([
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

  return [...incomeItems, ...expenseItems]
    .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
    .slice(0, lim);
};
