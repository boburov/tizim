import prisma from "../../../config/prisma.js";

// Moliyaviy ko'p-yozuvli amallarni ATOMIK qiladi. To'lov qabul qilish (create)
// va bekor qilish (remove) bir nechta jadvalga yozadi (PaymentTransaction +
// StudentPayment.paidAmount). Yarmida xato bo'lsa pul "yarim holatda" qolib
// ketmasligi uchun barchasini bitta tranzaksiyaga o'raymiz.
//
// ─────────────────────────────────────────────────────────────────
// MONGO → POSTGRES: ENG MUHIM YAXSHILANISH SHU YERDA
//
// Mongo variantida atomiklik SHARTLI edi: tranzaksiya faqat replica
// set / mongos'da ishlardi, standalone Mongo'da esa kod jimgina
// `work(null)` ga tushib, yozuvlarni KAFOLATSIZ ketma-ket bajarardi.
// Ya'ni ishlab chiqarishda "atomik", lokalda esa yo'q - va pul yarim
// holatda qolishi MUMKIN edi.
//
// PostgreSQL'da tranzaksiya har doim bor, shuning uchun zaxira yo'l
// (fallback) ATAYLAB OLIB TASHLANDI: endi yoki hammasi yoziladi, yoki
// hech nima. "Atomiklik yo'q" degan holat umuman mavjud emas.
//
// IMZO O'ZGARMADI: `work(client)` avvalgidek bitta argument oladi.
// Mongo'da u `session` edi va har bir so'rovga `{ session }` sifatida
// uzatilardi; endi u PRISMA TRANZAKSIYA KLIENTI - so'rovlar to'g'ridan
// to'g'ri o'sha klientda bajariladi:
//
//     await runFinanceTxn(async (tx) => {
//       await tx.studentPayment.update(...);
//       await tx.paymentTransaction.create(...);
//     });
//
// DIQQAT: `work` ichida `prisma` (global klient) ishlatilsa, o'sha
// so'rov tranzaksiyadan TASHQARIDA qoladi va rollback unga ta'sir
// qilmaydi. Har doim berilgan `tx` dan foydalaning.
// ─────────────────────────────────────────────────────────────────

// Prisma'ning standart chegaralari moliya uchun juda qisqa (maxWait 2s,
// timeout 5s). O'quvchini butunlay o'chirish 12 ta jadvalga tegadi va
// katta guruhda 5 soniyaga sig'masligi mumkin - o'shanda tranzaksiya
// yarim yo'lda uzilardi. Chegaralar ochiq va kengaytirilgan.
const TXN_OPTIONS = {
  maxWait: 10_000, // ulanish havzasidan klient kutish
  timeout: 60_000, // tranzaksiyaning umumiy davomiyligi
};

export const runFinanceTxn = (work) => prisma.$transaction(work, TXN_OPTIONS);
