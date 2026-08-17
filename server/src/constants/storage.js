/**
 * SAQLAGICHNI AVTO-TOZALASH SOZLAMALARI.
 *
 * Ilgari bu qiymatlar `models/storageSettings.model.js` ichida edi va
 * Mongoose sxemasining `enum` i bo'lib xizmat qilardi. Model fayllari
 * ko'chirish tugagach o'chiriladi, qiymatlar esa SERVISGA kerak
 * (`updateSettings` kelgan chastotani shu bo'yicha tekshiradi,
 * `nextRunAt` esa kun sonini o'qiydi) - shuning uchun konstantaga
 * chiqarildi.
 *
 * `CLEANUP_FREQUENCIES` Prisma `CleanupFrequency` enum'i bilan AYNAN
 * bir xil bo'lishi SHART - aks holda yozuv bazada rad etiladi.
 */
export const CLEANUP_FREQUENCIES = Object.freeze([
  "weekly",
  "monthly",
  "semiannual",
]);

/**
 * Chastota -> kun soni.
 *
 * "semiannual" 182 kun (yarim yil), 180 EMAS - bu qiymat Mongo
 * davridan o'zgarmasdan ko'chdi. O'zgartirilsa mavjud markazlarda
 * keyingi avto-tozalash sanasi jimgina siljib ketardi.
 */
export const FREQUENCY_DAYS = Object.freeze({
  weekly: 7,
  monthly: 30,
  semiannual: 182,
});
