// O'QITUVCHI KOMPOZIT BAHOSI - sof funksiya. DB yo'q, I/O yo'q, LLM yo'q.
//
// SAVOL: "bu o'qituvchi markazga qanchalik qiymat qo'shmoqda?"
//
// ==========  ENG MUHIM QAROR: LIFT, XOM O'RTACHA EMAS  ==========
//
// Har uch o'lchov FILIAL O'RTACHASIDAN FARQ sifatida olinadi:
//
//   xom o'rtacha  →  "uning o'quvchilari 4.6 ball"        ← KIM GURUH OLGANINI o'lchaydi
//   lift          →  "uning o'quvchilari 3.4 dan 4.2 ga"  ← UNING HISSASINI o'lchaydi
//
// Nega bu shunchalik muhim: markazlarda kuchli guruhlar odatda tajribali
// o'qituvchiga beriladi. Xom o'rtacha bo'yicha baholash "kimga yaxshi
// guruh berilgan" reytingini yasaydi va aynan eng qiyin ishni qilayotgan
// o'qituvchi eng past chiqadi. Bunday reyting bir marta maosh qaroriga
// ta'sir qilsa - tuzatib bo'lmaydigan adolatsizlik va owner ishonchining
// butunlay yo'qolishi.
//
// ==========  VAZNLAR VA ULARNING SABABI  ==========
//
//   0.40  davomat lift   - o'quvchilar darsga KELADIMI. O'qituvchi eng
//                          kuchli ta'sir qiladigan va eng tez o'lchanadigan
//                          ko'rsatkich.
//   0.35  baho o'sishi   - o'quvchilar O'RGANDIMI. Eng muhim natija, lekin
//                          namunasi kichik va sub'ektiv (baho qo'yuvchi -
//                          o'sha o'qituvchining o'zi), shuning uchun
//                          davomatdan sal past.
//   0.25  to'lov intizomi- oila QONIQDIMI. Eng kech va eng shovqinli
//                          signal (oilaviy moliyaga bog'liq), shuning
//                          uchun eng kichik vazn.
//
// Vazn yig'indisi MAVJUD o'lchovlar bo'yicha normallanadi: bahosi yo'q
// o'qituvchi qolgan ikki o'lchov bo'yicha to'liq baholanadi, "baho yo'q =
// 0 ball" degan jazo olmaydi.

import { sampleConfidence } from "./common.scoring.js";

const clamp01 = (v: any) => Math.max(0, Math.min(1, v));

/** Lift'ni [0,1] ga soladi: 0.5 = filial o'rtachasi, 1.0 = to'liq ustunlik. */
const liftToScore = (lift: any,fullLift: any) => {
  if (lift == null || !Number.isFinite(lift) || fullLift <= 0) return null;
  return clamp01(0.5 + lift / (2 * fullLift));
};

export const TEACHER_WEIGHTS = Object.freeze({
  attendance: 0.4,
  grade: 0.35,
  payment: 0.25,
});

// "To'liq ustunlik" chegaralari - bundan katta farq 1.0 ga to'yinadi.
// Qiymatlar real markaz ma'lumotidan kelib chiqqan: davomatda 10% farq
// katta, bahoda 0.5 ball katta (1-5 shkalada), to'lovda 20% katta.
const FULL_LIFT = Object.freeze({
  attendance: 0.1,
  grade: 0.5,
  payment: 0.2,
});

/**
 * O'qituvchining kompozit bahosi.
 *
 * @param {object} signals - collectTeacherSignals'dagi bitta o'qituvchi yozuvi
 * @returns {{score, confidence, dimensions, measured}}
 *   score      [0,1] - 0.5 = aynan filial o'rtachasida
 *   dimensions - har o'lchov bo'yicha lift va ball (UI tushuntirishi uchun)
 *   measured   - nechta o'lchov haqiqatan o'lchandi (0..3)
 */
export const scoreTeacher = (signals: any) => {
  const { outcome, payment, baseline } = signals;

  const attLift =
    outcome.attendanceRate != null && baseline?.attendanceRate != null
      ? outcome.attendanceRate - baseline.attendanceRate
      : null;

  const gradeLift =
    outcome.gradeImprovement != null && baseline?.gradeImprovement != null
      ? outcome.gradeImprovement - baseline.gradeImprovement
      : null;

  const payLift =
    payment?.onTimeRatio != null && baseline?.paymentOnTimeRatio != null
      ? payment.onTimeRatio - baseline.paymentOnTimeRatio
      : null;

  const dimensions = [
    {
      key: "attendance",
      label: "Davomat ustunligi",
      lift: attLift,
      // Foizda ko'rsatiladi: "+14%" owner uchun "+0.14" dan aniqroq.
      display: attLift == null ? null : Math.round(attLift * 100),
      unit: "%",
      weight: TEACHER_WEIGHTS.attendance,
      score: liftToScore(attLift, FULL_LIFT.attendance),
    },
    {
      key: "grade",
      label: "Baho o'sishi ustunligi",
      lift: gradeLift,
      display: gradeLift == null ? null : Number(gradeLift.toFixed(2)),
      unit: "ball",
      weight: TEACHER_WEIGHTS.grade,
      score: liftToScore(gradeLift, FULL_LIFT.grade),
    },
    {
      key: "payment",
      label: "To'lov intizomi ustunligi",
      lift: payLift,
      display: payLift == null ? null : Math.round(payLift * 100),
      unit: "%",
      weight: TEACHER_WEIGHTS.payment,
      score: liftToScore(payLift, FULL_LIFT.payment),
    },
  ];

  const active = dimensions.filter((d) => d.score != null);
  const measured = active.length;

  // Hech narsa o'lchanmagan - ball BERILMAYDI (0 emas, null).
  // 0 berish yangi o'qituvchini eng yomon o'ringa qo'yardi.
  if (!measured) {
    return { score: null, confidence: 0, dimensions, measured: 0 };
  }

  const weightSum = active.reduce((a, d) => a + d.weight, 0);
  const score = active.reduce((a, d) => a + (d.score as number) * d.weight, 0) / weightSum;

  // ISHONCH ikki narsadan: qancha o'lchov mavjud va namuna qanchalik katta.
  // Filialdagi o'qituvchilar soni ham hisobga olinadi: 2 o'qituvchili
  // filialda "o'rtachadan yuqori" deyish deyarli ma'nosiz.
  const dimensionCoverage = measured / dimensions.length;
  const sample = sampleConfidence({
    observed: outcome.gradeSamples || outcome.lessons || 0,
    minSample: 20,
    fullSample: 200,
    consistency: (baseline?.sampleSize || 0) >= 5 ? 1 : 0.6,
  });

  return {
    score: clamp01(score),
    confidence: clamp01(dimensionCoverage * sample),
    dimensions,
    measured,
  };
};

/**
 * MAOSH TAVSIYASI SHARTLARI.
 *
 * Owner "yaxshi o'qituvchining maoshini oshirish kerak deb ayt" dedi -
 * bu bajariladi, lekin SHARTSIZ emas. Sabab: maosh tavsiyasi tizimdagi
 * eng qimmat tavsiya. Bir marta noto'g'ri chiqsa (bir haftalik omadni
 * "ajoyib o'qituvchi" deb o'qisak) owner pul sarflaydi va keyin butun
 * AI'ga ishonmay qo'yadi.
 *
 * ==========  NEGA CHEGARA NISBIY, MUTLAQ EMAS  ==========
 *
 * Birinchi urinishda bu yerda `score >= 0.72` turardi. U REAL MA'LUMOTDA
 * HECH QACHON ISHLAMADI: 40 o'qituvchilik filialda eng yaxshisi 0.69
 * to'plagan va tavsiya hech kimga chiqmagan, ya'ni funksiya o'lik edi.
 *
 * Sabab tuzatib bo'lmaydigan darajada tuzilmaviy: ball FILIAL
 * O'RTACHASIDAN FARQdan chiqadi, demak uning tarqalishi filialga bog'liq.
 * Bir xil kuchli jamoada eng yaxshi o'qituvchi o'rtachadan 3% farq
 * qiladi, tarqoq jamoada esa 20%. Mutlaq chegara birinchisida hech
 * qachon ishlamaydi, ikkinchisida esa juda oson ishlaydi - ya'ni u
 * o'qituvchini emas, JAMOANING BIR XILLIGINI o'lchaydi.
 *
 * Yechim: chegara TENGDOSHLARGA nisbatan - yuqori 10% ga kirish. U har
 * qanday tarqalishda ma'noli qoladi.
 *
 * Besh shart, har biri aniq bir soxta signalni to'sadi:
 *
 *   1. yuqori 10% da        → o'rtacha ishlayotgan o'qituvchi
 *   2. score >= 0.58        → "yomon jamoaning eng yaxshisi" (mutlaq POL:
 *                             yuqori 10% da bo'lish o'rtachadan PAST
 *                             bo'lishni istisno qilmaydi)
 *   3. confidence >= 0.5    → ma'lumoti kam yangi o'qituvchi
 *   4. measured >= 2        → bitta o'lchovga tayangan bir tomonlama baho
 *   5. tengdosh namunasi >= 4 → "3 o'qituvchidan eng yaxshisi" ma'nosizligi
 *
 * MIQDOR AYTILMAYDI. Bu qasddan: "unga 500 000 so'm qo'shing" deyish AI
 * qila oladigan narsa emas - u budjetni, bozor narxini, o'qituvchining
 * joriy maoshini va shartnomasini bilmaydi. AI KO'RSATKICHNI beradi,
 * QARORNI owner qabul qiladi.
 */
export const RAISE_GATE = Object.freeze({
  topPercentile: 0.1,
  minScore: 0.58,
  minConfidence: 0.5,
  minDimensions: 2,
  minPeerSample: 4,
});

/**
 * @param {object} result   - scoreTeacher natijasi
 * @param {object} baseline - filial bazasi (sampleSize uchun)
 * @param {{rank: number, total: number}} position - saralangan ro'yxatdagi
 *   o'rni (1 dan boshlanadi). Bu ma'lumot faqat BUTUN ro'yxat qurilgandan
 *   keyin ma'lum, shuning uchun tashqaridan beriladi.
 */
export const qualifiesForRaise = ({ score, confidence, measured }: any,baseline: any,position: any) => {
  if (score == null) return false;
  if (score < RAISE_GATE.minScore) return false;
  if (confidence < RAISE_GATE.minConfidence) return false;
  if (measured < RAISE_GATE.minDimensions) return false;
  if ((baseline?.sampleSize || 0) < RAISE_GATE.minPeerSample) return false;
  if (!position?.total) return false;

  // Math.ceil: 12 o'qituvchida yuqori 10% = 2 kishi (1.2 → 2), 0 emas.
  // Aks holda kichik filiallarda tavsiya hech qachon chiqmasdi.
  const slots = Math.max(1, Math.ceil(position.total * RAISE_GATE.topPercentile));
  return position.rank <= slots;
};
