/**
 * `modules/finance/services/financeTxn.helper.js` DAGI TRANZAKSIYA
 * CHEGARALARI.
 *
 * ── NEGA FUNKSIYA EMAS, KONSTANTA ──
 *
 * Express'da bu `runFinanceTxn(work)` — global `prisma` ni yopib turgan
 * o'ram. NestJS'da klient DI orqali keladi (`PrismaService`), ya'ni
 * global nusxaga tayanadigan o'ram YOZIB BO'LMAYDI. Shu sababli tashqariga
 * faqat CHEGARALAR chiqariladi va chaqiruvchi o'z klientida yozadi:
 *
 *     await this.prisma.$transaction(async (tx) => { ... }, FINANCE_TXN_OPTIONS);
 *
 * Xulq-atvor AYNAN bir xil qoladi.
 *
 * ── CHEGARALAR NEGA KATTA ──
 *
 * Prisma standarti moliya uchun juda qisqa (maxWait 2s, timeout 5s).
 * O'quvchini butunlay o'chirish 12 ta jadvalga tegadi va katta guruhda
 * 5 soniyaga sig'masligi mumkin — o'shanda tranzaksiya yarim yo'lda
 * uzilardi.
 *
 * ⚠ `modules/finance` KO'CHIRILGANDA: bu fayl o'sha modulning
 * `financeTxn` yordamchisiga ALMASHTIRILADI, ikkinchi manba bo'lib
 * qolmasin. Qiymatlar Express bilan bir xil bo'lishi SHART.
 */
export const FINANCE_TXN_OPTIONS = {
  maxWait: 10_000, // ulanish havzasidan klient kutish
  timeout: 60_000, // tranzaksiyaning umumiy davomiyligi
} as const;
