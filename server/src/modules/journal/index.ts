/**
 * JOURNAL MODULINING OMMAVIY API'SI.
 *
 * Boshqa modullar bu yerga FAQAT shu fayl orqali kiradi
 * (`scripts/arch-scan.mjs` R1 — chuqur import chegara buzilishi).
 * Ro'yxat TASHQARIDAN haqiqatan so'ralayotgan sirt bilan cheklangan:
 * bu yerga yozilmagan narsa — modulning ICHKI ishi.
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { JournalService } from './journal.service.js';
export { JournalVerifyService } from './journal-verify.service.js';
export type { JournalLineInput } from './journal.service.js';
export type { TxClient } from './journal.service.js';
