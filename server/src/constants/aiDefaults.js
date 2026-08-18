/**
 * AI DVIGATELI SOZLAMALARI — KODDAGI STANDARTLAR.
 *
 * Ilgari bu qiymatlar `models/aiConfig.model.js` ichida edi va Mongoose
 * sxemasining `default` i bo'lib xizmat qilardi. Model fayllari
 * ko'chirish tugagach O'CHIRILADI, bu qiymatlar esa TO'QQIZTA faylga
 * kerak (`aiConfig.service`, olti insight servisi, ikki scoring
 * moduli) — shuning uchun konstantaga chiqarildi.
 *
 * `AI_ENGINE_VERSION` shu papkadagi `ai.js` da — u alohida ma'noga
 * ega (yozuvlarga muhrlanadigan versiya).
 */

// Ishonch chegarasi: bundan past bo'lsa UI ball emas, "Ma'lumot yetarli emas"
// ko'rsatadi. Bu bitta qoida mahsulotning ishonchini saqlaydi - sayoz
// ma'lumot ustida ishonchli ko'rinadigan raqam chiqarish eng katta xavf.
export const DEFAULT_CONFIDENCE_FLOOR = 0.4;

// --- CHURN (ketish xavfi) vaznlari ---
//
// Bular ML emas, EKSPERT TIZIMI priorlari. Sabab: 3-12 oylik ma'lumot va
// bir necha yuz o'quvchi bilan ML o'qitish ortiqcha moslashadi (overfit).
// Vaznlar backtest (aiChurnBacktest.seed.js) bilan tarixiy leftReason ga
// qarshi tekshiriladi va owner ularni UI dan sozlay oladi.
//
// Yig'indi 1.0 bo'lishi SHART EMAS - normalizatsiya scoring qatlamida.
export const DEFAULT_CHURN_WEIGHTS = Object.freeze({
  attendanceDrop: 0.3,
  absenceStreak: 0.2,
  debtDays: 0.2,
  gradeTrend: 0.15,
  groupChurn: 0.1,
  freezeHistory: 0.05,
});

// --- TO'LOV kechikishi xavfi vaznlari ---
export const DEFAULT_PAYMENT_WEIGHTS = Object.freeze({
  latePaymentHistory: 0.4,
  currentDebtDays: 0.3,
  // To'liq to'lanmagan davrlar SONI (nisbat emas - nomi shuni aks ettiradi).
  unpaidPeriods: 0.2,
  attendanceDrop: 0.1,
});

// --- Chegaralar (threshold) ---
// Xom qiymatni [0,1] ga aylantirish uchun "to'liq yomon" nuqtasi.
// Mas. attendanceDropFull=0.4 → davomat 40% ga tushsa normalized=1.
export const DEFAULT_THRESHOLDS = Object.freeze({
  // Davomat pasayishi (nisbiy, oxirgi 4 hafta vs oldingi 4 hafta)
  attendanceDropFull: 0.4,
  // Ketma-ket qoldirilgan darslar soni
  absenceStreakFull: 4,
  // Faol qarz kunlari
  debtDaysFull: 30,
  // Baho pasayishi (1-5 shkalada, oyiga)
  gradeTrendFull: 1.0,
  // Guruhdagi churn ulushi
  groupChurnFull: 0.3,
  // Yuqori/o'rta xavf chegaralari (severity uchun)
  highSeverityScore: 0.7,
  mediumSeverityScore: 0.45,
});
