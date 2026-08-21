// ═══════════════════════════════════════════════════════════════════════════
// MOSLIK QATLAMI — `config/db.js` (eski Mongoose ulanish moduli).
//
// MUAMMO: MongoDB → PostgreSQL ko'chishida bu fayl O'CHIRILDI, lekin unga
// murojaat qiladigan 26 ta seed skripti va 2 ta test YANGILANMAY qoldi.
// Natijada ular ishga tushishi bilanoq yiqilardi:
//
//     ERR_MODULE_NOT_FOUND: .../src/config/db.js
//
// Bu JIMGINA zarar edi: `npm run seed:expense-categories` (standart chiqim
// kategoriyalari), `seed:fake-data`, `migrate:journal-backfill` va
// `test:ledger` — hammasi ishlamas holatda turardi va buni faqat ishga
// tushirgandagina bilib bo'lardi.
//
// Eski modul AYNAN ikkita nom eksport qilardi — `connectDB` va
// `disconnectDB` — va `config/prisma.js` da o'sha nomlar, o'sha vazifa
// bilan mavjud. Shuning uchun 26 faylni tahrirlash o'rniga bitta
// qayta-eksport yetarli: chaqiruvchilar uchun hech narsa o'zgarmaydi,
// ulanish esa Prisma orqali ketadi.
//
// YAGONA NUSXA saqlanadi: bu fayl yangi klient YARATMAYDI, `prisma.js`
// dagi global nusxani qayta eksport qiladi (aks holda har seed o'z
// ulanish hovuzini ochib, `too many clients` ga olib kelardi).
//
// KELAJAK: seed'lar to'g'ridan-to'g'ri `config/prisma.js` ga o'tkazilgach
// bu fayl o'chiriladi.
// ═══════════════════════════════════════════════════════════════════════════
export { connectDB, disconnectDB, default } from "./prisma.js";
