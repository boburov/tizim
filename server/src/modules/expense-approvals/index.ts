/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPENSE-APPROVALS OMMAVIY API'SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu modul kodbazadagi ENG KO'P bog'lanilgan modullardan biri (7 ta
 * boshqa modul unga murojaat qiladi) va sabab tabiiy: "chegaradan oshgan
 * xarajatni tasdiqqa yubor" qoidasi chiqim, oylik, o'qituvchi maoshi,
 * depozit va guruh amallarining HAMMASIDA takrorlanadi.
 *
 * Shuning uchun bu yerda kirish nuqtasi BITTA qilib belgilandi: modul
 * ichki fayllari o'zgarsa iste'molchilar buzilmaydi va "kim nimaga
 * bog'langan" savoliga javob bitta faylni o'qib olinadi.
 *
 * ⚠ `ExpenseApprovalsService` TO'LIQ chiqarilgan — uni toraytirish
 * (masalan faqat `checkExpenseLimit`) alohida ish va u iste'molchilarni
 * qayta yozishni talab qiladi. Hozircha maqsad — CHEGARANI o'rnatish,
 * ya'ni murojaat SHU fayldan o'tsin; sirtni qisqartirish keyingi qadam.
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { ExpenseApprovalsService } from './expense-approvals.service.js';
