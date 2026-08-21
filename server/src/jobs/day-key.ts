import { localTodayKey } from '../common/utils/date.js';

/**
 * Bugungi MAHALLIY kun kaliti — dedupe kaliti uchun.
 *
 * ⚠ `null` DA JIMGINA DAVOM ETMAYDI. `localTodayKey` faqat buzuq sanada
 * `null` qaytaradi va bu amalda yuz bermaydi — lekin agar yuz bersa,
 * `` `att-unmarked:${null}` `` ko'rinishidagi kalit HAR KUN uchun BIR XIL
 * bo'lardi. Ya'ni birinchi kundan keyin bu eslatma BOSHQA HECH QACHON
 * yuborilmasdi va buni hech narsa ko'rsatmasdi: xato yo'q, xabar ham yo'q.
 *
 * Shuning uchun bu yerda ochiq xato — pg-boss uni qayta uradi va jurnalda
 * ko'rinadi.
 */
export const requireDayKey = (now: Date = new Date()): string => {
  const key = localTodayKey(now);
  if (!key) {
    throw new Error("Mahalliy kun kalitini hisoblab bo'lmadi — dedupe kaliti xavfsiz emas");
  }
  return key;
};
