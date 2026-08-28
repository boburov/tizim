/**
 * XAZINA HISOBLARI — "pul turgan joylar".
 *
 * ⚠ SERVER RO'YXATINING NUSXASI (`common/constants/ledger.ts` →
 * `TREASURY_KINDS`) va u BILAN BIR XIL TARTIBDA. Bu yerda faqat
 * FILTR VARIANTLARI uchun: zod sxemasi `accountKind` ni qat'iy
 * ro'yxatdan qabul qiladi, ya'ni bu yerga qo'shilgan noto'g'ri
 * qiymat 400 bilan qaytardi.
 *
 * `deposit`, `revenue`, `expense`, `equity` kabi hisoblar ATAYLAB
 * YO'Q: ular pul turgan joy emas, yozuvni muvozanatlash uchun. Ularni
 * "Hisob" filtriga qo'yish "Daromad hisobida qancha pul bor?" degan
 * ma'nosiz savolni taklif qilardi.
 */
export const TREASURY_ACCOUNT_KINDS = Object.freeze([
  "cash",
  "terminal",
  "click",
  "payme",
  "bank",
  "uzcard",
  "humo",
  "transit",
  "other",
]);

export default TREASURY_ACCOUNT_KINDS;
