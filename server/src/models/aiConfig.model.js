import mongoose from "mongoose";

// Dvigatel versiyasi. Vaznlar yoki formula o'zgarganda QO'LDA oshiriladi -
// shunda eski insight'lar qaysi mantiq bilan yaratilgani ma'lum bo'ladi.
export const AI_ENGINE_VERSION = "1.0.0";

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

const aiConfigSchema = new mongoose.Schema(
  {
    // null = GLOBAL standart. ObjectId = shu filial uchun override.
    // Yechim tartibi: filial konfiguratsiyasi → global → koddagi default.
    // Filialda o'quvchi profili farq qilishi mumkin (mas. bir filial
    // universitet yonida - dushanba qoldirish normal), shuning uchun
    // override kerak.
    // Indeks pastda unique bilan ochiq e'lon qilingan - bu yerda `index: true`
    // qo'yilsa mongoose ikkita bir xil indeks yaratmoqchi bo'lib ogohlantiradi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    churnWeights: {
      type: Map,
      of: Number,
      default: () => new Map(Object.entries(DEFAULT_CHURN_WEIGHTS)),
    },
    paymentWeights: {
      type: Map,
      of: Number,
      default: () => new Map(Object.entries(DEFAULT_PAYMENT_WEIGHTS)),
    },
    thresholds: {
      type: Map,
      of: Number,
      default: () => new Map(Object.entries(DEFAULT_THRESHOLDS)),
    },

    confidenceFloor: {
      type: Number,
      default: DEFAULT_CONFIDENCE_FLOOR,
      min: 0,
      max: 1,
    },

    // LLM narrator yoqilganmi. false → deterministik shablon matn.
    // Faza 1 da ATAYLAB false: tizim LLMsiz ham foydali bo'lishi kerak.
    narrationEnabled: { type: Boolean, default: false },
    narrationModel: { type: String, default: "gemini-2.5-flash" },

    engineVersion: { type: String, default: AI_ENGINE_VERSION },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Bir filial uchun bitta konfiguratsiya (global uchun ham bitta).
aiConfigSchema.index({ branchId: 1 }, { unique: true });

aiConfigSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AiConfig = mongoose.model("AiConfig", aiConfigSchema);

export default AiConfig;
