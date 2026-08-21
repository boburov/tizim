/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI DVIGATELI VERSIYASI (`constants/ai.js` KO'CHIRMASI).
 *
 * ── NEGA HAR YOZUVGA YOZILADI ──
 * `AiRun`, `AiReport` va `Insight` yozuvlariga dvigatel versiyasi
 * MUHRLANADI. Sabab: formulalar o'zgarganda eski yozuvlar QAYTA
 * HISOBLANMAYDI (hisobot — o'sha kundagi SURAT). Versiyasiz keyin
 * "bu son qaysi mantiq bilan chiqqan?" degan savolga javob bo'lmasdi.
 *
 * ⚠ Formulani o'zgartirgan odam bu raqamni ham OSHIRISHI kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const AI_ENGINE_VERSION = '1.0.0';

/**
 * AI HISOBOT DAVRLARI.
 *
 * ⚠ Prisma `AiReportPeriod` enum'i bilan AYNAN bir xil bo'lishi SHART —
 * aks holda validatordan o'tgan qiymat bazada rad etiladi.
 */
export const AI_REPORT_PERIODS = ['daily', 'weekly', 'monthly'] as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI DVIGATELI SOZLAMALARI — KODDAGI STANDARTLAR
 * (`constants/aiDefaults.js` KO'CHIRMASI).
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ISHONCH CHEGARASI: bundan past bo'lsa UI ball emas, "Ma'lumot yetarli
 * emas" ko'rsatadi.
 *
 * ⚠ Bu BITTA qoida mahsulotning ishonchini saqlaydi — sayoz ma'lumot
 * ustida ISHONCHLI KO'RINADIGAN raqam chiqarish eng katta xavf.
 */
export const DEFAULT_CONFIDENCE_FLOOR = 0.4;

/**
 * CHURN (ketish xavfi) VAZNLARI.
 *
 * ⚠ Bular ML EMAS, EKSPERT TIZIMI priorlari. Sabab: 3-12 oylik ma'lumot
 * va bir necha yuz o'quvchi bilan ML o'qitish ORTIQCHA MOSLASHADI
 * (overfit). Vaznlar backtest bilan tarixiy `leftReason` ga qarshi
 * tekshiriladi va owner ularni UI dan sozlay oladi.
 *
 * ⚠ Yig'indi 1.0 bo'lishi SHART EMAS — normalizatsiya scoring qatlamida.
 */
export const DEFAULT_CHURN_WEIGHTS = Object.freeze({
  attendanceDrop: 0.3,
  absenceStreak: 0.2,
  debtDays: 0.2,
  gradeTrend: 0.15,
  groupChurn: 0.1,
  freezeHistory: 0.05,
});

/** TO'LOV kechikishi xavfi vaznlari. */
export const DEFAULT_PAYMENT_WEIGHTS = Object.freeze({
  latePaymentHistory: 0.4,
  currentDebtDays: 0.3,
  // ⚠ To'liq to'lanmagan davrlar SONI (nisbat emas — nomi shuni aks ettiradi).
  unpaidPeriods: 0.2,
  attendanceDrop: 0.1,
});

/**
 * CHEGARALAR (threshold) — xom qiymatni [0,1] ga aylantirish uchun
 * "to'liq yomon" nuqtasi.
 *
 * Masalan `attendanceDropFull = 0.4` → davomat 40% ga tushsa
 * `normalized = 1`.
 */
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
