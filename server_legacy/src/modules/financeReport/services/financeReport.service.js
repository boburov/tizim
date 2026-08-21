import { Prisma } from "@prisma/client";
import prisma from "../../../config/prisma.js";
import {
  branchFilter,
  branchGroupFilter,
} from "../../../helpers/branchContext.helper.js";

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

/**
 * Tranzaksiyalar yig'indisi (kassa asosida - `paidAt` oraliqda).
 *
 * `Model` o'rniga PRISMA DELEGATE NOMI beriladi ("paymentTransaction").
 * Mongoose modeli obyekt edi; Prisma'da esa klientning maydoni.
 */
const sumTransactions = async (table, start, end) => {
  const res = await prisma[table].aggregate({
    where: {
      ...branchFilter(),
      paidAt: { gte: start, lte: end },
      isDeleted: false,
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { total: res._sum.amount || 0, count: res._count._all || 0 };
};

// Kirim tranzaksiyalarini to'lov usuli bo'yicha ajratish
const sumByMethod = async (start, end) => {
  const rows = await prisma.paymentTransaction.groupBy({
    by: ["method"],
    where: {
      ...branchFilter(),
      paidAt: { gte: start, lte: end },
      isDeleted: false,
    },
    _sum: { amount: true },
  });
  const out = { cash: 0, card: 0 };
  for (const r of rows) if (r.method in out) out[r.method] = r._sum.amount || 0;
  return out;
};

// Hisoblangan (billed) summa, qoldiq va YOMON QARZ - oylik snapshotlar bo'yicha.
// Model: StudentPayment yoki TeacherSalary (ikkalasida ham expectedAmount/paidAmount bor).
// Write-off qilingan (yomon qarz) yozuvlar billed/paid/outstanding'dan CHIQARILADI
// va alohida badDebt sifatida jamlanadi (TeacherSalary'da writtenOff yo'q → 0).
/**
 * Hisoblangan (billed) summa, qoldiq va YOMON QARZ - oylik snapshotlar bo'yicha.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA XOM SQL (MIGRATION.md §3.2.4 ruxsat beradi)
 *
 * Bu shartli yig'indi: `SUM(...) FILTER (WHERE ...)` va qator
 * darajasidagi `GREATEST(expected - paid, 0)`. Prisma'ning
 * `aggregate()` / `groupBy()` API'si ikkalasini ham ifodalay olmaydi -
 * ular faqat butun to'plam bo'yicha oddiy yig'indi beradi.
 *
 * Muqobil "hammasini o'qib, JS'da yig'ish" bo'lardi: bir oyda o'n
 * minglab qator, hammasi tarmoq orqali - va filial ko'lami JS'da
 * qayta yozilishi kerak bo'lardi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA IKKITA FUNKSIYA, bitta umumiy emas
 *
 * Ilgari bitta `billedAndOutstanding(Model, ...)` IKKALA model uchun
 * ishlatilardi. U faqat MONGO jim bo'lgani uchun ishlardi:
 * `$ifNull: ["$writtenOff", false]` `TeacherSalary` da maydon YO'Q
 * bo'lgani uchun `false` ga aylanardi.
 *
 * Postgres'da `teacher_salaries.writtenOff` ustuni CHINDAN yo'q va
 * so'rov `column does not exist` bilan yiqiladi. Shuning uchun ikkita
 * alohida funksiya: har biri O'Z jadvalining haqiqiy ustunlarini
 * ishlatadi. Farq endi KODDA ko'rinadi, jimgina emas.
 * ═══════════════════════════════════════════════════════════════════
 */

/** Filial shartini xom SQL uchun tayyorlaydi. */
const rawBranchClause = () => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return Prisma.empty;
  const v = bf.branchId;
  if (typeof v === "string") return Prisma.sql` AND "branchId" = ${v}`;
  if (v?.in) {
    if (!v.in.length) return Prisma.sql` AND FALSE`; // fail-closed
    return Prisma.sql` AND "branchId" IN (${Prisma.join(v.in)})`;
  }
  return Prisma.empty;
};

const ZERO = {
  billed: 0,
  paid: 0,
  outstanding: 0,
  badDebt: 0,
  openingOutstanding: 0,
};

const toNumbers = (row) => ({
  billed: Number(row?.billed) || 0,
  paid: Number(row?.paid) || 0,
  outstanding: Number(row?.outstanding) || 0,
  badDebt: Number(row?.badDebt) || 0,
  openingOutstanding: Number(row?.openingOutstanding) || 0,
});

/**
 * O'QUVCHI TO'LOVLARI bo'yicha.
 *
 * BOSHLANG'ICH QOLDIQ (`isOpening`) - import orqali kiritilgan,
 * tizimdan oldingi hisob:
 *   • billed'dan CHIQARILADI - tizim bu summani hech qachon
 *     hisoblamagan, uni "o'sha oy hisoblangan daromad" deb ko'rsatish
 *     hisobotni yolg'on qilardi;
 *   • outstanding'ga KIRADI - bu haqiqiy, undiriladigan qarz;
 *   • paid'dan ham chiqariladi - unga qarshi kelgan pul REAL to'lov
 *     sifatida PaymentTransaction'da alohida sanaladi.
 *
 * WRITE-OFF (yomon qarz) billed/paid/outstanding'dan chiqarilib,
 * alohida `badDebt` bo'lib jamlanadi.
 */
const studentBilledStats = async (year, month) => {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM("expectedAmount") FILTER (
        WHERE NOT "writtenOff" AND NOT "isOpening"), 0) AS "billed",
      COALESCE(SUM("paidAmount") FILTER (
        WHERE NOT "writtenOff" AND NOT "isOpening"), 0) AS "paid",
      COALESCE(SUM(GREATEST("expectedAmount" - "paidAmount", 0)) FILTER (
        WHERE NOT "writtenOff"), 0) AS "outstanding",
      COALESCE(SUM("writeOffAmount") FILTER (WHERE "writtenOff"), 0) AS "badDebt",
      COALESCE(SUM(GREATEST("expectedAmount" - "paidAmount", 0)) FILTER (
        WHERE "isOpening" AND NOT "writtenOff"), 0) AS "openingOutstanding"
    FROM student_payments
    WHERE year = ${Number(year)} AND month = ${Number(month)}
    ${rawBranchClause()}
  `;
  return rows.length ? toNumbers(rows[0]) : { ...ZERO };
};

/**
 * O'QITUVCHI MAOSHLARI bo'yicha.
 *
 * `writtenOff` / `writeOffAmount` USTUNLARI YO'Q - maosh qatori
 * hisobdan chiqarilmaydi. Shuning uchun `badDebt` HAR DOIM 0 va bu
 * o'ylab topilgan qiymat emas: maosh uchun "yomon qarz" tushunchasi
 * mavjud emas.
 */
const teacherBilledStats = async (year, month) => {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM("expectedAmount") FILTER (WHERE NOT "isOpening"), 0) AS "billed",
      COALESCE(SUM("paidAmount") FILTER (WHERE NOT "isOpening"), 0) AS "paid",
      COALESCE(SUM(GREATEST("expectedAmount" - "paidAmount", 0)), 0) AS "outstanding",
      0 AS "badDebt",
      COALESCE(SUM(GREATEST("expectedAmount" - "paidAmount", 0)) FILTER (
        WHERE "isOpening"), 0) AS "openingOutstanding"
    FROM teacher_salaries
    WHERE year = ${Number(year)} AND month = ${Number(month)}
    ${rawBranchClause()}
  `;
  return rows.length ? toNumbers(rows[0]) : { ...ZERO };
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
const expenseBranchWhere = () => {
  const bf = branchFilter();
  return Object.keys(bf).length ? { OR: [bf, { branchId: null }] } : {};
};

const sumExpensesCash = async (start, end) => {
  const res = await prisma.expense.aggregate({
    where: {
      ...expenseBranchWhere(),
      spentAt: { gte: start, lte: end },
      isDeleted: false,
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return { total: res._sum.amount || 0, count: res._count._all || 0 };
};

const sumExpensesAccrual = async (year, month) => {
  const rows = await prisma.expense.groupBy({
    by: ["categoryKind"],
    where: {
      ...expenseBranchWhere(),
      accrualYear: Number(year),
      accrualMonth: Number(month),
      isDeleted: false,
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const byKind = { operating: 0, payroll: 0, tax: 0, capital: 0 };
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const t = r._sum.amount || 0;
    if (r.categoryKind in byKind) byKind[r.categoryKind] = t;
    total += t;
    count += r._count._all || 0;
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
    sumTransactions("paymentTransaction", start, end),
    sumTransactions("paymentTransaction", prev.start, prev.end),
    sumTransactions("salaryTransaction", start, end),
    sumTransactions("salaryTransaction", prev.start, prev.end),
    studentBilledStats(y, m),
    teacherBilledStats(y, m),
    sumByMethod(start, end),
    sumExpensesCash(start, end),
    sumExpensesCash(prev.start, prev.end),
    sumExpensesAccrual(y, m),
    // XODIMLAR MAOSHI - uchinchi chiqim manbasi. Qo'shilmasa "sof foyda"
    // haqiqiydan yuqori chiqardi (aynan ijara/kommunal bilan bo'lgan xato).
    sumTransactions("staffSalaryTransaction", start, end),
    sumTransactions("staffSalaryTransaction", prev.start, prev.end),
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
      sumTransactions("paymentTransaction", start, end),
      sumTransactions("salaryTransaction", start, end),
      studentBilledStats(p.year, p.month),
      sumExpensesCash(start, end),
      sumTransactions("staffSalaryTransaction", start, end),
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
  // ═══════════════════════════════════════════════════════════════
  // FILIAL KO'LAMI - ILGARI UMUMAN YO'Q EDI (xavfsizlik tuzatishi).
  //
  // `debt_write_offs` da `branchId` USTUNI YO'Q, shuning uchun oddiy
  // `branchFilter()` qo'llanmaydi - ko'lam GURUH orqali olinadi
  // (`branchGroupFilter`), xuddi davomat va a'zoliklardagi kabi.
  //
  // Busiz filial direktori BOSHQA filiallarning hisobdan chiqarilgan
  // qarzlarini ko'rardi - o'quvchi ismi bilan birga. Modul 501
  // qaytarib turgani uchun bu ko'rinmasdi; ko'chirish uni TIRILTIRADI,
  // shuning uchun teshik ayni ko'chirishda yopiladi.
  // ═══════════════════════════════════════════════════════════════
  const where = { ...(await branchGroupFilter("groupId")) };

  // `group` (Mongo ref) -> `groupId` (Prisma ustuni). `where.group`
  // yozilsa u RELATION filtri bo'lardi - jimgina boshqa ma'no.
  if (groupId) where.groupId = String(groupId);

  // `breakdown` HAQIQIY relation (Mongo'da ichki massiv edi) -
  // shuning uchun `some` to'g'ri.
  if (year && month) {
    where.breakdown = { some: { year: Number(year), month: Number(month) } };
  } else if (year) {
    where.breakdown = { some: { year: Number(year) } };
  }

  const rows = await prisma.debtWriteOff.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Number(limit),
    include: { breakdown: true },
  });

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
    id: String(r.id),
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
    prisma.studentPayment.groupBy({
      by: ["groupId"],
      // `isDeleted` YO'Q: StudentPayment va TeacherSalary'da bunday
      // ustun umuman mavjud emas (MIGRATION.md - filtr tarjima
      // qilinmaydi, o'chiriladi).
      where: { ...branchFilter(), year: y, month: m },
      _sum: { paidAmount: true, expectedAmount: true },
    }),
    prisma.teacherSalary.groupBy({
      by: ["groupId"],
      where: { ...branchFilter(), year: y, month: m },
      _sum: { paidAmount: true },
    }),
  ]);

  // `groupId` null bo'lishi MUMKIN (fiksa oylik / bonus) - o'shanda
  // sun'iy kalitga tushamiz, aks holda "null" satri ID deb o'qilardi.
  const keyOf = (id) => (id ? String(id) : UNASSIGNED);

  const map = new Map();
  for (const r of studentRows) {
    const id = keyOf(r.groupId);
    map.set(id, {
      groupId: id,
      income: r._sum.paidAmount || 0,
      billed: r._sum.expectedAmount || 0,
      expense: 0,
    });
  }
  for (const r of teacherRows) {
    const id = keyOf(r.groupId);
    const cur = map.get(id) || { groupId: id, income: 0, billed: 0, expense: 0 };
    cur.expense = r._sum.paidAmount || 0;
    map.set(id, cur);
  }

  const items = [...map.values()].map((it) => ({
    ...it,
    net: it.income - it.expense,
  }));

  // Guruh nomlarini biriktirish (sun'iy kalit bazaga YUBORILMAYDI)
  const ids = items.map((it) => it.groupId).filter((id) => id !== UNASSIGNED);
  const groups = await prisma.group.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const nameById = new Map(groups.map((g) => [String(g.id), g.name]));
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

  // ═══════════════════════════════════════════════════════════════
  // FILIAL KO'LAMI - ILGARI UCHALA SO'ROVDA HAM YO'Q EDI
  // (xavfsizlik tuzatishi).
  //
  // Ledger o'quvchi, o'qituvchi va xodim ISMLARI bilan birga
  // tranzaksiyalarni qaytaradi. Ko'lamsiz filial direktori butun
  // tarmoqning pul harakatini ko'rardi.
  //
  // Modul 501 qaytarib turgani uchun teshik ko'rinmasdi - ko'chirish
  // uni TIRILTIRADI, shuning uchun ayni shu yerda yopiladi.
  // ═══════════════════════════════════════════════════════════════
  const scope = branchFilter();

  const [payments, salaries, staffSalaries] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { ...scope, year: y, month: m, isDeleted: false },
      orderBy: { paidAt: "desc" },
      take: lim,
      include: {
        student: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.salaryTransaction.findMany({
      where: { ...scope, year: y, month: m, isDeleted: false },
      orderBy: { paidAt: "desc" },
      take: lim,
      include: {
        teacher: { select: { id: true, firstName: true, lastName: true } },
        group: { select: { id: true, name: true } },
      },
    }),
    // Xodimlar maoshi ham kassa harakati - ledger'da ko'rinmasa, egasi
    // "pul qayerga ketdi?" degan savolga javob topa olmasdi.
    prisma.staffSalaryTransaction.findMany({
      where: { ...scope, year: y, month: m, isDeleted: false },
      orderBy: { paidAt: "desc" },
      take: lim,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  const fullName = (u) =>
    u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : "Noma'lum";

  const incomeItems = payments.map((r) => ({
    id: String(r.id),
    type: "income",
    name: fullName(r.student),
    groupName: r.group?.name || "-",
    category: "O'quvchi to'lovi",
    method: r.method,
    amount: r.amount,
    paidAt: r.paidAt,
  }));

  const expenseItems = salaries.map((r) => ({
    id: String(r.id),
    type: "expense",
    name: fullName(r.teacher),
    groupName: r.group?.name || "-",
    category: "O'qituvchi maoshi",
    method: r.method,
    amount: r.amount,
    paidAt: r.paidAt,
  }));

  const staffExpenseItems = staffSalaries.map((r) => ({
    id: String(r.id),
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
