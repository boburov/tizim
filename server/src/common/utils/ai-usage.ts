/**
 * AI SARF JURNALI — oy kaliti.
 *
 * `server/src/constants/aiUsage.js` NING TO'LIQ ko'chirmasi. Dastlab
 * faqat `usageMonthKey` ko'chirilgan edi (heartbeat uchun); AI moduli
 * kelgach narx jadvali ham SHU YERGA qo'shildi — ikkinchi nusxa
 * yaratilmasligi uchun.
 */

/** "2026-08" — hisob davri kaliti. ⚠ MAHALLIY vaqt bo'yicha, UTC emas. */
export const usageMonthKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const AI_USAGE_KINDS = ['narration', 'digest', 'report', 'assistant'];
export const AI_USAGE_PROVIDERS = ['gemini', 'openai'];

/**
 * Model narxlari — $/1M token.
 *
 * Kod ichida turadi, bazada emas: narx o'zgarsa bu qatorni yangilash
 * ONGLI qaror bo'lishi kerak.
 *
 * ⚠ Ro'yxatda yo'q model uchun 0 emas, ENG QIMMAT tarif olinadi —
 * noma'lum xarajatni nolga tenglashtirish byudjet chegarasini
 * jimgina o'chirib qo'yardi.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3-flash-preview': { input: 1.5, output: 7.5 },
};

const FALLBACK_PRICING = { input: 4.0, output: 18.0 };

/** Token sonidan USD narx. Har doim musbat, hech qachon NaN. */
export const estimateCostUsd = (
  model: string,
  inputTokens = 0,
  outputTokens = 0,
): number => {
  const p = MODEL_PRICING[model] || FALLBACK_PRICING;
  const cost =
    (Number(inputTokens) || 0) * (p.input / 1_000_000) +
    (Number(outputTokens) || 0) * (p.output / 1_000_000);
  return Number.isFinite(cost) ? cost : 0;
};
