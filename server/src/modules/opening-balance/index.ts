/**
 * OPENING-BALANCE MODULINING OMMAVIY API'SI.
 *
 * Boshqa modullar bu modulga FAQAT shu fayl orqali kiradi
 * (`scripts/arch-scan.mjs` R1). Nima eksport qilinsa — o'sha va'da:
 * ichki fayl nomi o'zgarsa iste'molchi buzilmaydi.
 *
 * Sxemalar bu yerda, chunki foydalanuvchi YARATISH (auth `register-user`,
 * users `create`) boshlang'ich qoldiqni ham qabul qiladi — ya'ni
 * boshlang'ich summa qoidasi ikki begona modulga kerak. Qoida esa
 * BITTA joyda — shu modulda — yashaydi.
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { OpeningBalanceService } from './opening-balance.service.js';
export { openingAmountSchema, openingNoteSchema } from './opening-balance.validators.js';
