import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Group from "../../../models/group.model.js";
import Insight from "../../../models/insight.model.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";

// MOLIYA SIGNALLARI.
//
// Bashorat KOGORTLI ROLL-FORWARD bilan qilinadi, vaqt qatori (ARIMA/
// Holt-Winters) bilan EMAS. Sabab: o'quv markazi - obuna biznesi.
// Keyingi oy daromadi "o'tgan 12 oy trendi" dan emas, BUGUN o'qiyotgan
// aniq o'quvchilar ro'yxatidan chiqadi va ularning har birining kutilgan
// to'lovi StudentPayment.expectedAmount da ALLAQACHON yozilgan.
//
// Shu sababdan bu bashorat mavsumiy modeldan ANIQROQ va - eng muhimi -
// TUSHUNTIRIB beriladi: "142 o'quvchi × o'rtacha 480 000 so'm − ketish
// xavfi 6% − kutilayotgan yomon qarz".

const DAY_MS = 24 * 60 * 60 * 1000;
const toId = (v) => new mongoose.Types.ObjectId(String(v));

/** (yil, oy) juftligini n oy orqaga/oldinga suradi. */
export const shiftMonth = (year, month, delta) => {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
};

export const monthKey = ({ year, month }) => `${year}-${String(month).padStart(2, "0")}`;

/**
 * HAQIQATDA YIG'ILGAN daromad - oy bo'yicha.
 *
 * PaymentTransaction.paidAt bo'yicha guruhlanadi (year/month EMAS): bu
 * "qaysi oyda PUL KELDI" degan savol, "qaysi oy uchun to'landi" emas.
 * Pul oqimi uchun aynan birinchisi kerak - iyulda to'langan may qarzi
 * iyul pul oqimida turadi.
 */
export const collectedByMonth = async (months, now) => {
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  );
  const rows = await PaymentTransaction.aggregate([
    ...branchMatchStage(),
    { $match: { paidAt: { $gte: since } } },
    {
      $group: {
        _id: {
          year: { $year: "$paidAt" },
          month: { $month: "$paidAt" },
        },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
  return rows.map((r) => ({
    year: r._id.year,
    month: r._id.month,
    key: monthKey(r._id),
    amount: r.amount,
    count: r.count,
  }));
};

/**
 * XARAJAT - oy bo'yicha.
 *
 * HALOL CHEKLOV: kodbazada umumiy xarajat taksonomiyasi YO'Q (ijara,
 * kommunal, marketing uchun model yo'q). Yozilgan yagona chiqim oqimi -
 * o'qituvchi maoshi (SalaryTransaction). Shuning uchun bu signal
 * "jami xarajat" emas, "MAOSH xarajati" deb nomlanadi va insight matnida
 * ham shunday yoziladi. "Marketing +18%" kabi tavsiya berish uchun avval
 * ExpenseCategory modeli kerak - uni bo'lmaganda o'ylab topish yolg'on.
 */
export const salaryExpenseByMonth = async (months, now) => {
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  );
  const rows = await SalaryTransaction.aggregate([
    ...branchMatchStage(),
    { $match: { isDeleted: { $ne: true }, paidAt: { $gte: since } } },
    {
      $group: {
        _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } },
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1 } },
  ]);
  return rows.map((r) => ({
    year: r._id.year,
    month: r._id.month,
    key: monthKey(r._id),
    amount: r.amount,
    count: r.count,
  }));
};

/**
 * MUDDATI O'TGAN TO'LOVLAR - filial darajasidagi yig'ma kesim.
 *
 * writtenOff=true chiqarib tashlanadi: u qarz allaqachon yo'qotish deb
 * tan olingan, uni qayta "yig'ilishi kerak" ro'yxatiga qo'yish owner
 * vaqtini behuda sarflashga majbur qilardi.
 *
 * "Muddati o'tgan" = davri TUGAGAN va to'liq yopilmagan. Joriy oy
 * to'lovi hali kechikmagan hisoblanadi (oy davom etmoqda).
 */
export const overdueSignal = async (now) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const rows = await StudentPayment.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        writtenOff: false,
        status: { $in: ["unpaid", "partial"] },
        $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
        // Faqat TUGAGAN davrlar: (year < joriy) yoki (year = joriy va month < joriy).
        $or: [{ year: { $lt: year } }, { year, month: { $lt: month } }],
      },
    },
    {
      $group: {
        _id: null,
        amount: { $sum: { $subtract: ["$expectedAmount", "$paidAmount"] } },
        periods: { $sum: 1 },
        students: { $addToSet: "$student" },
        oldestYear: { $min: "$year" },
        ids: { $push: "$_id" },
      },
    },
  ]);

  const r = rows[0];
  if (!r) {
    return { amount: 0, periods: 0, students: 0, maxDebtDays: 0, ids: [] };
  }

  // Eng eski to'lanmagan davrni aniq topamiz - $min faqat yilni to'g'ri
  // beradi, (yil, oy) juftligining minimumi uchun saralash kerak.
  const oldest = await StudentPayment.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        writtenOff: false,
        status: { $in: ["unpaid", "partial"] },
        $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
        $or: [{ year: { $lt: year } }, { year, month: { $lt: month } }],
      },
    },
    { $sort: { year: 1, month: 1 } },
    { $limit: 1 },
    { $project: { year: 1, month: 1 } },
  ]);

  let maxDebtDays = 0;
  if (oldest[0]) {
    const periodEnd = new Date(Date.UTC(oldest[0].year, oldest[0].month, 0));
    maxDebtDays = Math.max(0, Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS));
  }

  return {
    amount: r.amount || 0,
    periods: r.periods || 0,
    students: (r.students || []).length,
    maxDebtDays,
    oldestYear: r.oldestYear,
    ids: (r.ids || []).slice(0, 20),
  };
};

/**
 * KOGORTLI BASHORAT - keyingi oy daromadi.
 *
 * Rev(keyingi oy) = Σ(faol o'quvchi × kutilgan to'lov × (1 − ketish ehtimoli))
 *
 * Ketish ehtimoli dvigatelning O'ZI hozir hisoblagan churn ball'laridan
 * olinadi (ochiq student_churn_risk insight'lari). Shuning uchun
 * orkestrator tartibi MUHIM: o'quvchi detektori moliyadan OLDIN ishlashi
 * kerak, aks holda bashorat kechagi ballarga tayanadi.
 *
 * Yangi o'quvchi oqimi ATAYLAB kiritilmagan: u lidlardan bashorat
 * qilinadi va bu ikkinchi darajali noaniqlik qo'shadi. Bashorat
 * "hozirgi bazadan kutilayotgan daromad" - konservativ va tushunarli.
 */
export const revenueForecast = async (branchId, now) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // (a) Joriy oyning kutilgan daromadi - baza.
  const currentRows = await StudentPayment.aggregate([
    ...branchMatchStage(),
    { $match: { year, month, writtenOff: false } },
    {
      $group: {
        _id: null,
        expected: { $sum: "$expectedAmount" },
        paid: { $sum: "$paidAmount" },
        students: { $addToSet: "$student" },
      },
    },
  ]);
  const current = currentRows[0] || { expected: 0, paid: 0, students: [] };
  const currentStudents = (current.students || []).map(String);

  // (b) Hozir faol o'quvchilar (guruh a'zoligi ochiq).
  const groups = await Group.find({
    branchId: toId(branchId),
    isDeleted: false,
    isActive: true,
  })
    .select("_id")
    .lean();
  const activeMembers = groups.length
    ? await GroupMembership.distinct("student", {
        group: { $in: groups.map((g) => g._id) },
        leftAt: null,
        isDeleted: false,
      })
    : [];
  const activeIds = new Set(activeMembers.map(String));

  // (c) Ketish xavfi - dvigatel hozir hisoblagan ballardan.
  const churnRows = await Insight.find({
    branchId: toId(branchId),
    kind: "student_churn_risk",
    status: { $in: ["open", "acked"] },
  })
    .select("subjectId score expectedImpact.amount")
    .lean();

  let atRisk = 0;
  let riskyStudents = 0;
  for (const r of churnRows) {
    // Faqat hali faol o'quvchilar: allaqachon ketganning insight'i
    // yopilishini kutayotgan bo'lishi mumkin.
    if (!activeIds.has(String(r.subjectId))) continue;
    riskyStudents += 1;
    // Kutilayotgan yo'qotish = shu o'quvchining oylik to'lovi × ketish ehtimoli.
    atRisk += (r.expectedImpact?.amount || 0) * r.score;
  }

  // (d) Yig'ish darajasi - kutilgan daromadning qanchasi HAQIQATDA keladi.
  // Oxirgi 3 tugagan oy bo'yicha. Bu "kutilgan" va "yig'ilgan" orasidagi
  // tarixiy uzilishni bashoratga kiritadi.
  const collectionRate = await historicalCollectionRate(now);

  const baseExpected = current.expected || 0;
  const forecastGross = Math.max(0, baseExpected - atRisk);
  const forecastNet = forecastGross * collectionRate.rate;

  const deltaRatio = baseExpected > 0 ? (forecastGross - baseExpected) / baseExpected : 0;

  return {
    currentExpected: baseExpected,
    currentPaid: current.paid || 0,
    currentStudents: currentStudents.length,
    activeStudents: activeIds.size,
    atRisk,
    riskyStudents,
    collectionRate: collectionRate.rate,
    collectionSample: collectionRate.months,
    forecastGross,
    forecastNet,
    // Manfiy = pasayish kutilmoqda. Insight aynan shu sonni ko'rsatadi.
    deltaRatio,
    nextPeriod: shiftMonth(year, month, 1),
  };
};

/**
 * TARIXIY YIG'ISH DARAJASI - oxirgi 3 tugagan oy: paid / expected.
 * Bashoratni "hammasi to'lanadi" optimizmidan qutqaradi.
 */
export const historicalCollectionRate = async (now) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periods = [1, 2, 3].map((d) => shiftMonth(year, month, -d));

  const rows = await StudentPayment.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        writtenOff: false,
        $or: periods.map((p) => ({ year: p.year, month: p.month })),
      },
    },
    {
      $group: {
        _id: null,
        expected: { $sum: "$expectedAmount" },
        paid: { $sum: "$paidAmount" },
      },
    },
  ]);

  const r = rows[0];
  // Ma'lumot yo'q → 1 (neytral). Sun'iy pessimizm ham xato bo'lardi.
  if (!r || !r.expected) return { rate: 1, months: 0, expected: 0, paid: 0 };
  return {
    rate: Math.max(0, Math.min(1, r.paid / r.expected)),
    months: periods.length,
    expected: r.expected,
    paid: r.paid,
  };
};

/**
 * PUL OQIMI kesimi - joriy oyda kirim, chiqim va qoldiq.
 * "Kassa ogohlantirishi" shundan chiqadi: chiqim kirimdan oshib ketsa.
 */
export const cashflowSignal = async (now) => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [inRows, outRows] = await Promise.all([
    PaymentTransaction.aggregate([
      ...branchMatchStage(),
      { $match: { paidAt: { $gte: start } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    SalaryTransaction.aggregate([
      ...branchMatchStage(),
      { $match: { isDeleted: { $ne: true }, paidAt: { $gte: start } } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);

  const inflow = inRows[0]?.amount || 0;
  const outflow = outRows[0]?.amount || 0;
  // Oyning qancha qismi o'tdi - qoldiqni oy oxiriga proyeksiya qilish uchun.
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const monthProgress = daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;

  return {
    inflow,
    outflow,
    net: inflow - outflow,
    monthProgress,
    // Chiziqli proyeksiya: oy oxirigacha shu tezlikda davom etsa.
    // Sodda, lekin tushunarli - va maosh oy oxirida to'lanadi, shuning
    // uchun proyeksiya ATAYLAB pessimistik tomonga qaramaydi.
    projectedInflow: monthProgress > 0 ? inflow / monthProgress : inflow,
  };
};

/**
 * Barcha moliya signallarini yig'adi.
 * @param {string} branchId
 */
export const collectFinanceSignals = async (branchId, now = new Date()) => {
  const [collected, expense, overdue, forecast, cashflow] = await Promise.all([
    collectedByMonth(7, now),
    salaryExpenseByMonth(7, now),
    overdueSignal(now),
    revenueForecast(branchId, now),
    cashflowSignal(now),
  ]);
  return { collected, expense, overdue, forecast, cashflow };
};
