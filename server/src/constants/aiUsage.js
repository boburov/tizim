/**
 * AI SARF JURNALI — TURLAR, NARX JADVALI VA OY KALITI.
 *
 * Ilgari `models/aiUsageLog.model.js` ichida edi. Model fayllari
 * ko'chirish tugagach O'CHIRILADI, bu qiymatlar esa byudjet servisiga
 * va validatorlarga kerak.
 *
 * `MODEL_PRICING` — provayder narxlari o'zgarganda QO'LDA yangilanadi.
 * Narx noto'g'ri bo'lsa byudjet chegarasi ham noto'g'ri ishlaydi.
 */

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
