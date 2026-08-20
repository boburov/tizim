/**
 * AI SARF JURNALI — oy kaliti.
 *
 * `server/src/constants/aiUsage.js` dan FAQAT heartbeat'ga kerak bo'lgan
 * qism. Narx jadvali (`MODEL_PRICING`) va `estimateCostUsd` ATAYLAB
 * ko'chirilmadi: ular AI moduliga tegishli va o'sha modul bilan birga
 * kelishi kerak — narx jadvalining ikkinchi nusxasi paydo bo'lsa, biri
 * yangilanib ikkinchisi eskirib qolardi va tannarx hisobi jimgina
 * noto'g'ri bo'lardi.
 */

/** "2026-08" — hisob davri kaliti. ⚠ MAHALLIY vaqt bo'yicha, UTC emas. */
export const usageMonthKey = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};
