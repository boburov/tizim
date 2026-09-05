/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FINANCE OMMAVIY API'SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eng ko'p bog'lanilgan modul (10 ta modul). Uch servis chiqariladi va
 * ularning har biri BOSHQA savolga javob beradi:
 *
 *   `StudentPaymentService`      — o'quvchi qarzi va to'lov rejasi
 *                                  (guruhga qo'shish/chiqarish, muzlatish,
 *                                  boshlang'ich qoldiq shu yerga tegadi).
 *   `FinancialTransactionService`— PUL HARAKATI: har qanday tushum/chiqim
 *                                  jurnalga shu orqali tushadi. Uni
 *                                  chetlab o'tish "kassa mos kelmadi"
 *                                  degan xatolarning manbai.
 *   `GroupFeeService`            — guruh narxi (dars jadvali va kurs
 *                                  narxidan hisoblanadi).
 *
 * ⚠ SIKL OGOHLANTIRISHI: `finance ↔ teacher-salary`, `finance ↔ deposits`
 * va `finance ↔ student-freeze` orasida modul darajasidagi sikl BOR
 * (`npm run arch:map`). Bu fayl uni TUZATMAYDI — u faqat kirish
 * nuqtasini bittaga keltiradi. Sikl uzish alohida ish: umumiy qismni
 * uchinchi modulga chiqarish yoki bog'liqlikni interfeys orqali teskari
 * qilish kerak.
 *
 * ⚠ MODUL KLASSI BU YERDA YO'Q — ATAYLAB.
 * Uni re-eksport qilish ish vaqtida SIKL yaratardi: servisni olish
 * uchun `*.module.ts` ham yuklanardi, u esa boshqa modullarni
 * import qiladi ("Cannot access 'XModule' before initialization").
 * Modul klassi `<modul>/<modul>.module.js` dan olinadi — u ham
 * ommaviy kirish nuqtasi.
 */
export { StudentPaymentService } from './student-payment.service.js';
export { FinancialTransactionService } from './financial-transaction.service.js';
export { GroupFeeService } from './group-fee.service.js';
// O'quvchi to'lovini QABUL QILISH (import oqimida ham kerak).
export { TransactionService } from './transaction.service.js';
