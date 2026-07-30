import {
  DEFAULT_PAYMENT_WEIGHTS,
  DEFAULT_THRESHOLDS,
} from "../../../models/aiConfig.model.js";
import { computeConfidence } from "./churn.scoring.js";

// TO'LOV XAVFI - churn'dan ALOHIDA model.
//
// Nega alohida: bu ikki xil biznes savoli va ular chalkashtirilsa ikkalasi
// ham buziladi.
//   churn  = "bu o'quvchi ketadimi?"        → daromadni butunlay yo'qotish
//   payment= "bu o'quvchi kechikib to'laydimi?" → pul oqimi muammosi
//
// Muntazam qatnaydigan, lekin doim kechikib to'laydigan o'quvchi ketmaydi
// (churn past) - lekin pul oqimi uchun muhim. Aksincha, bir marta to'lab
// keyin g'oyib bo'lgan o'quvchi churn xavfi, to'lov xavfi emas.
// Bitta ballda birlashtirish ikkalasini ham ko'rinmas qilardi.

const norm = (value, full) => {
  if (value == null || !Number.isFinite(value) || full <= 0) return 0;
  return Math.max(0, Math.min(1, value / full));
};

const squash = (x, k = 6, x0 = 0.45) => 1 / (1 + Math.exp(-k * (x - x0)));

const readMap = (map, defaults) => {
  if (!map) return { ...defaults };
  const obj = map instanceof Map ? Object.fromEntries(map) : map;
  return { ...defaults, ...obj };
};

/**
 * O'quvchining keyingi davrda kechikib to'lash ehtimoli.
 *
 * @param {object} signals - collectStudentSignals natijasi
 * @param {object} config  - AiConfig
 */
export const scorePaymentRisk = (signals, config = {}) => {
  const w = readMap(config.paymentWeights, DEFAULT_PAYMENT_WEIGHTS);
  const t = readMap(config.thresholds, DEFAULT_THRESHOLDS);
  const { debt, discipline, attendance } = signals;

  const defs = [
    {
      key: "latePaymentHistory",
      label: "Kechikib to'lash tarixi",
      value: Math.round((discipline.lateRatio || 0) * 100),
      unit: "%",
      normalized: norm(discipline.lateRatio, 0.5),
      weight: w.latePaymentHistory,
    },
    {
      key: "currentDebtDays",
      label: "Joriy qarz muddati",
      value: debt.debtDays || 0,
      unit: "kun",
      normalized: norm(debt.debtDays, t.debtDaysFull),
      weight: w.currentDebtDays,
    },
    {
      key: "unpaidPeriods",
      label: "To'liq to'lanmagan davrlar",
      value: debt.periods || 0,
      unit: "ta",
      normalized: norm(debt.periods, 3),
      weight: w.unpaidPeriods,
    },
    {
      key: "attendanceDrop",
      label: "Davomat pasayishi",
      value: Math.round((attendance.drop || 0) * 100),
      unit: "%",
      // Davomat bu yerda IKKINCHI darajali signal: qatnashmayotgan o'quvchi
      // to'lashni ham to'xtatadi. Vazni ataylab kichik (0.1).
      normalized: norm(attendance.drop, t.attendanceDropFull),
      weight: w.attendanceDrop,
    },
  ];

  const factors = defs.map((d) => ({
    ...d,
    contribution: d.normalized * d.weight,
    direction: d.normalized > 0.05 ? "bad" : "neutral",
  }));

  const weightSum = factors.reduce((a, f) => a + f.weight, 0) || 1;
  const score = squash(factors.reduce((a, f) => a + f.contribution, 0) / weightSum);

  // Ishonch: to'lov tarixi qancha uzun bo'lsa, shuncha ishonchli.
  // Bu yerda "lessons" o'rniga to'lov davrlari soni ishlatiladi.
  const confidence = computeConfidence({
    lessons: (discipline.periods || 0) * 3,
    enrolledDays: signals.enrolledDays,
    factors,
    lastSignalDays: 0,
  });

  const severity =
    score >= t.highSeverityScore
      ? "high"
      : score >= t.mediumSeverityScore
        ? "medium"
        : "low";

  return {
    score,
    confidence,
    severity,
    factors: factors.sort((a, b) => b.contribution - a.contribution),
  };
};

export const paymentActions = (factors, { debtAmount = 0, debtDays = 0 } = {}) => {
  const actions = [];
  const by = Object.fromEntries(factors.map((f) => [f.key, f]));

  if (debtDays > 30) {
    actions.push({
      key: "escalate_debt",
      label: "Qarz 30 kundan oshdi — shaxsan bog'laning",
      dueInDays: 1,
    });
  } else if (debtAmount > 0) {
    actions.push({
      key: "remind_payment",
      label: "To'lov eslatmasini yuboring",
      dueInDays: 3,
    });
  }

  if ((by.latePaymentHistory?.normalized ?? 0) > 0.5) {
    actions.push({
      key: "payment_schedule",
      label: "Doimiy kechikish — to'lov sanasini kelishib oling",
      dueInDays: 7,
    });
  }
  if (!actions.length) {
    actions.push({ key: "monitor", label: "Kuzatuvda saqlang", dueInDays: null });
  }
  return actions;
};
