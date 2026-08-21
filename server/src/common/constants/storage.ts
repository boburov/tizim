/**
 * SAQLAGICHNI AVTO-TOZALASH SOZLAMALARI —
 * `server/src/constants/storage.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ `CLEANUP_FREQUENCIES` Prisma `CleanupFrequency` enum'i bilan AYNAN
 * bir xil bo'lishi SHART — aks holda yozuv bazada rad etiladi.
 */
export const CLEANUP_FREQUENCIES = Object.freeze([
  'weekly',
  'monthly',
  'semiannual',
]);

/**
 * Chastota → kun soni.
 *
 * ⚠ "semiannual" 182 kun (yarim yil), 180 EMAS — bu qiymat Mongo
 * davridan o'zgarmasdan ko'chdi. O'zgartirilsa mavjud markazlarda
 * keyingi avto-tozalash sanasi JIMGINA siljib ketardi.
 */
export const FREQUENCY_DAYS = Object.freeze({
  weekly: 7,
  monthly: 30,
  semiannual: 182,
});
