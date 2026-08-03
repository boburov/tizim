import mongoose from "mongoose";

// LLM XARAJAT JURNALI - har bir tashqi model chaqiruvi shu yerga tushadi.
//
// ==========  NEGA BU MODEL KERAK  ==========
//
// AI qatlami pullik sotiladi. Sotilgan narsaning tannarxi o'lchanmasa,
// uchta narsa sodir bo'ladi va uchalasi ham jimgina:
//
//  1. ZARAR KO'RINMAYDI. Narration navbati soatiga 25 ta yozadi, ya'ni
//     kuniga 600 tagacha. Bu oyiga ~$8.5 - ya'ni add-on narxidan ham
//     ko'p bo'lishi mumkin. Jurnalsiz buni faqat Google hisobidan,
//     oy oxirida, hamma tenant aralashib ketgan holda ko'rasiz.
//  2. CHEGARA QO'YIB BO'LMAYDI. "Oyiga 4000 chaqiruv" degan tarif
//     va'dasini bajarish uchun avval sanash kerak.
//  3. NARX ASOSLANMAYDI. Mijoz "nega $10?" desa, javob raqam bilan
//     bo'lishi kerak, taxmin bilan emas.
//
// Shuning uchun yozuv MUVAFFAQIYATSIZ chaqiruvlar uchun ham qoladi
// (ok: false): 429 va timeout naqshini ko'rmasdan chegarani to'g'ri
// tanlab bo'lmaydi.

export const AI_USAGE_KINDS = ["narration", "digest", "report", "assistant"];
export const AI_USAGE_PROVIDERS = ["gemini", "openai"];

/**
 * Model narxlari - $/1M token.
 *
 * Kod ichida turadi, bazada emas: narx o'zgarsa bu qatorni yangilash
 * kerak va bu ONGLI qaror bo'lishi kerak. Bazada tursa, kimdir uni
 * beixtiyor o'zgartirib qo'yardi va butun tannarx hisobi buzilardi.
 *
 * Ro'yxatda yo'q model uchun 0 emas, ENG QIMMAT tarif olinadi -
 * noma'lum xarajatni nolga tenglashtirish eng xavfli xato bo'lardi.
 */
export const MODEL_PRICING = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3-flash-preview": { input: 1.5, output: 7.5 },
};

const FALLBACK_PRICING = { input: 4.0, output: 18.0 };

/** Token sonidan USD narx. Har doim musbat, hech qachon NaN. */
export const estimateCostUsd = (model, inputTokens = 0, outputTokens = 0) => {
  const p = MODEL_PRICING[model] || FALLBACK_PRICING;
  const cost =
    (Number(inputTokens) || 0) * (p.input / 1_000_000) +
    (Number(outputTokens) || 0) * (p.output / 1_000_000);
  return Number.isFinite(cost) ? cost : 0;
};

/** "2026-08" - hisob davri kaliti. Mahalliy vaqt bo'yicha, UTC emas. */
export const usageMonthKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

const aiUsageLogSchema = new mongoose.Schema(
  {
    // Filial ixtiyoriy: navbat butun tenant bo'yicha ishlaydi va ba'zi
    // chaqiruvlar (masalan kelajakdagi umumiy xulosa) bitta filialga
    // tegishli bo'lmasligi mumkin.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    // Hisob davri. Byudjet tekshiruvi AYNAN shu maydon bo'yicha sanaydi,
    // shuning uchun u yozuvda saqlanadi - createdAt dan hisoblash
    // aggregation'ni sekinlashtirardi va oy chegarasida vaqt zonasi
    // xatosini keltirib chiqarardi.
    monthKey: { type: String, required: true, index: true },

    provider: { type: String, enum: AI_USAGE_PROVIDERS, required: true },
    model: { type: String, required: true },
    kind: { type: String, enum: AI_USAGE_KINDS, required: true, index: true },

    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },

    // Taxminiy tannarx. "Taxminiy" chunki provayder hisobida yaxlitlash
    // va chegirmalar (Batch, kesh) boshqacha bo'lishi mumkin. Qaror
    // qabul qilish uchun yetarli aniqlikda.
    costUsd: { type: Number, default: 0 },

    latencyMs: { type: Number, default: 0 },

    ok: { type: Boolean, default: true, index: true },
    // "429", "timeout", "empty", "too_long" - naqshni ko'rish uchun.
    errorCode: { type: String, default: "" },
  },
  { timestamps: true },
);

// Byudjet tekshiruvining yagona so'rovi: shu oyda nechta muvaffaqiyatli
// chaqiruv bo'ldi. Navbat har yurishda bir marta so'raydi.
aiUsageLogSchema.index({ monthKey: 1, ok: 1 });

// Jurnal 400 kun saqlanadi: bir yillik hisob-kitobni qayta tekshirish
// va mavsumiylikni ko'rish uchun yetadi, undan ortig'i keraksiz joy.
aiUsageLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60 });

aiUsageLogSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AiUsageLog = mongoose.model("AiUsageLog", aiUsageLogSchema);

export default AiUsageLog;
