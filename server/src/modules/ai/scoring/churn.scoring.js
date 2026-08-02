import {
  DEFAULT_CHURN_WEIGHTS,
  DEFAULT_THRESHOLDS,
} from "../../../models/aiConfig.model.js";
import { softNorm } from "./common.scoring.js";

// SCORING QATLAMI - sof funksiyalar. DB yo'q, I/O yo'q, LLM yo'q.
// Kirish: signals + config. Chiqish: ball + faktorlar + ishonch.
//
// NEGA ML EMAS: 3-12 oylik ma'lumot va bir necha yuz o'quvchi bilan
// o'qitilgan model shovqinga moslashadi va tushuntirib bo'lmaydi. Bu yerdagi
// vaznli-additiv model esa: (a) har bir sababni raqam bilan ko'rsatadi,
// (b) owner uni sozlay oladi, (c) backtest bilan kalibrlanadi.
// "Sabab" matni SHU YERDAN chiqadi, LLM dan emas.

// Bu yerdagi faktorlarning hech birida tabiiy shift YO'Q: davomat 40%
// dan ko'proq ham pasayishi, qarz 30 kundan ancha oshishi, dars
// qoldirish 4 tadan ko'p bo'lishi mumkin - va bularning har biri
// qo'shimcha ma'no tashiydi. Qattiq kesuvchi `norm` bo'lsa, chegaradan
// oshgan hamma o'quvchi bir xil ball olib, ro'yxat ustuvorlikni
// ko'rsatishni to'xtatardi.
const norm = softNorm;

/**
 * Logistik siqish. Nega kerak: sof vaznli yig'indi chekkalarda yomon
 * tarqaladi - hamma o'rtada to'planib qoladi va "82%" bilan "45%" farqi
 * yo'qoladi. Sigmoid ballni [0,1] bo'ylab yoyadi.
 * k=6, x0=0.45 - backtest bilan kalibrlanadigan ikki parametr.
 */
const squash = (x, k = 6, x0 = 0.45) => 1 / (1 + Math.exp(-k * (x - x0)));

const readMap = (map, defaults) => {
  if (!map) return { ...defaults };
  const obj = map instanceof Map ? Object.fromEntries(map) : map;
  return { ...defaults, ...obj };
};

/**
 * ISHONCH = dataDensity × recency × signalConsistency
 *
 * Bu "AI qanchalik ishonchli" EMAS. Bu "menda qancha ma'lumot bor edi".
 * Teatr bo'lmasligining yagona sababi - uchala ko'paytuvchi ham
 * kuzatiladigan faktlardan chiqadi, modelning o'z-o'zini baholashidan emas.
 */
export const computeConfidence = ({ lessons, enrolledDays, factors, lastSignalDays }) => {
  // (a) Ma'lumot zichligi: 4 haftada kamida 8 ta dars kutiladi (haftasiga 2).
  const dataDensity = Math.min(1, (lessons || 0) / 8);

  // (b) Yangi o'quvchi jazolanadi: 30 kundan kam bo'lsa trend mavjud emas.
  const tenure = enrolledDays == null ? 0.6 : Math.min(1, enrolledDays / 30);

  // (c) Yangilik: oxirgi signaldan beri o'tgan vaqt (14 kunlik yarim yemirilish).
  const recency = Math.exp(-(lastSignalDays ?? 0) / 14);

  // (d) Signal izchilligi: faktorlar bir-biriga zid bo'lsa ishonch pasayadi.
  // Barcha faktorlar bir yo'nalishda ko'rsatsa - ishonchli; bittasi yomon,
  // qolgani yaxshi bo'lsa - shovqin bo'lishi mumkin.
  const active = factors.filter((f) => f.normalized > 0.05);
  let consistency = 1;
  if (active.length >= 2) {
    const mean = active.reduce((a, f) => a + f.normalized, 0) / active.length;
    const variance =
      active.reduce((a, f) => a + (f.normalized - mean) ** 2, 0) / active.length;
    consistency = 1 - Math.min(0.5, Math.sqrt(variance));
  } else if (active.length === 1) {
    // Bitta faktor - kuchsiz dalil.
    consistency = 0.7;
  }

  return Math.max(0, Math.min(1, dataDensity * tenure * recency * consistency));
};

/**
 * O'quvchining ketish xavfini hisoblaydi.
 *
 * @param {object} signals - collectStudentSignals natijasi
 * @param {object} config  - AiConfig hujjati (yoki undefined → default)
 * @returns {{score, confidence, factors, severity}}
 */
export const scoreChurn = (signals, config = {}) => {
  const w = readMap(config.churnWeights, DEFAULT_CHURN_WEIGHTS);
  const t = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const { attendance, streak, grades, debt, groupChurn, freeze } = signals;

  // Har bir faktor: xom qiymat → normallashtirilgan → vazn → hissa.
  // label va unit UI da to'g'ridan-to'g'ri ko'rsatiladi va LLM narratorga
  // shu holicha uzatiladi.
  const defs = [
    {
      key: "attendanceDrop",
      label: "Davomat pasayishi",
      value: Math.round((attendance.drop || 0) * 100),
      unit: "%",
      normalized: norm(attendance.drop, t.attendanceDropFull),
      weight: w.attendanceDrop,
    },
    {
      key: "absenceStreak",
      label: "Ketma-ket qoldirilgan dars",
      value: streak.streak || 0,
      unit: "ta",
      normalized: norm(streak.streak, t.absenceStreakFull),
      weight: w.absenceStreak,
    },
    {
      key: "debtDays",
      label: "Qarzdorlik muddati",
      value: debt.debtDays || 0,
      unit: "kun",
      normalized: norm(debt.debtDays, t.debtDaysFull),
      weight: w.debtDays,
    },
    {
      key: "gradeTrend",
      label: "Baho pasayishi",
      value: Number((grades.delta || 0).toFixed(2)),
      unit: "ball",
      normalized: norm(grades.delta, t.gradeTrendFull),
      weight: w.gradeTrend,
    },
    {
      key: "groupChurn",
      label: "Guruhdagi ketish darajasi",
      value: Math.round((groupChurn.rate || 0) * 100),
      unit: "%",
      normalized: norm(groupChurn.rate, t.groupChurnFull),
      weight: w.groupChurn,
    },
    {
      key: "freezeHistory",
      label: "Ilgari muzlatgan",
      value: freeze.count || 0,
      unit: "marta",
      // Bitta muzlatish ham signal, lekin ikkitadan keyin to'yinadi.
      normalized: norm(freeze.count, 2),
      weight: w.freezeHistory,
    },
  ];

  const factors = defs.map((d) => ({
    ...d,
    contribution: d.normalized * d.weight,
    direction: d.normalized > 0.05 ? "bad" : "neutral",
  }));

  const weightSum = factors.reduce((a, f) => a + f.weight, 0) || 1;
  const raw = factors.reduce((a, f) => a + f.contribution, 0) / weightSum;
  const score = squash(raw);

  const lastSignalDays = attendance.lessons > 0 ? 0 : 14;
  const confidence = computeConfidence({
    lessons: attendance.lessons,
    enrolledDays: signals.enrolledDays,
    factors,
    lastSignalDays,
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
    // Ta'sir bo'yicha saralangan - UI eng muhim sababni birinchi ko'rsatadi.
    factors: factors.sort((a, b) => b.contribution - a.contribution),
  };
};

/**
 * Faktorlardan aniq harakatlar chiqaradi.
 * Deterministik: bir xil faktor → bir xil tavsiya. LLM bu ro'yxatni
 * O'ZGARTIRMAYDI, faqat chiroyli yozadi.
 */
export const churnActions = (factors, { debtAmount = 0 } = {}) => {
  const actions = [];
  const by = Object.fromEntries(factors.map((f) => [f.key, f]));

  if ((by.attendanceDrop?.normalized ?? 0) > 0.3 || (by.absenceStreak?.normalized ?? 0) > 0.5) {
    actions.push({
      key: "call_parent",
      label: "Ota-ona bilan bog'laning va sababini aniqlang",
      dueInDays: 2,
    });
  }
  if ((by.gradeTrend?.normalized ?? 0) > 0.3) {
    actions.push({
      key: "teacher_meeting",
      label: "O'qituvchi bilan individual suhbat tayinlang",
      dueInDays: 7,
    });
  }
  if (debtAmount > 0) {
    actions.push({
      key: "payment_plan",
      label: "To'lov jadvalini muhokama qiling",
      dueInDays: 3,
    });
  }
  if ((by.groupChurn?.normalized ?? 0) > 0.5) {
    actions.push({
      key: "review_group",
      label: "Guruhni tekshiring — ketish darajasi yuqori",
      dueInDays: 7,
    });
  }
  if (!actions.length) {
    actions.push({
      key: "monitor",
      label: "Kuzatuvda saqlang — hozircha aralashuv shart emas",
      dueInDays: null,
    });
  }
  return actions;
};
