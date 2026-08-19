import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";
import * as journal from "../modules/journal/services/journal.service.js";
import * as financialTx from "../modules/finance/services/financialTransaction.service.js";

// MIGRATSIYA: mavjud pul yozuvlarini JURNALGA ko'chirish.
//
// ══════════════════════════════════════════════════════════════════
// NEGA KERAK
// ══════════════════════════════════════════════════════════════════
// Jurnal bo'sh holatda ishga tushdi. Ulanish qo'shilgach FAQAT YANGI
// to'lovlar unga tushadi - eski tarix esa yo'q. Natijada "kassada
// qancha pul bor" savoliga jurnal NOL javob berardi, aslida kassada
// millionlab so'm bo'lsa ham.
//
// Bu skript butun tarixni qayta o'ynatadi.
//
// ══════════════════════════════════════════════════════════════════
// MONGOOSE → PRISMA (va nima soddalashdi)
// ══════════════════════════════════════════════════════════════════
// Eski nusxa Mongoose modellarini o'qir edi va HAR HUJJAT UCHUN
// "bu allaqachon yozilganmi?" deb jurnaldan qidirardi (`alreadyPosted`).
// U mo'rt edi: `PaymentTransaction` ham to'lov, ham depozitdan qoplash
// uchun ishlatilgani sababli `kind` bo'yicha qo'shimcha istisno
// yozilgan edi va bitta yangi yozuv turi qo'shilsa jimgina buzilardi.
//
// ENDI KERAK EMAS: har yozuvning `postingKey` i bor va u DB darajasida
// unique (qarang 20260819120000_journal_posting_key). Servis takroriy
// urinishda mavjud yozuvni qaytaradi. Ya'ni idempotentlik skript
// mantiqiga emas, INDEKSGA tayanadi — skriptni istalgancha qayta
// yugurtirish mumkin.
//
// ══════════════════════════════════════════════════════════════════
// TARTIB MUHIM
// ══════════════════════════════════════════════════════════════════
// Depozitga to'ldirish QOPLASHDAN oldin yozilishi kerak - aks holda
// oraliq holatda depozit hisobi manfiy ko'rinardi. Manbalar tartibi
// va har biri ichida sana bo'yicha saralash buni ta'minlaydi.
//
// ISHLATISH:
//   npm run migrate:journal-backfill
//   npm run migrate:journal-backfill -- --dry     (faqat sanaydi)

const isDry = process.argv.includes("--dry");

const runSource = async ({ label, rows, post }) => {
  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    if (isDry) {
      posted += 1;
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await post(row);
      if (res?.duplicate) skipped += 1;
      else if (res?.skipped || !res?.entry) skipped += 1;
      else posted += 1;
    } catch (err) {
      failed += 1;
      logger.warn({ err: err?.message, id: row.id, label }, "Yozib bo'lmadi");
    }
  }

  logger.info({ label, posted, skipped, failed, total: rows.length }, "Manba ko'chirildi");
  return { posted, skipped, failed };
};

const seed = async () => {
  await connectDB();
  if (isDry) logger.info("QURUQ YURISH (--dry): hech narsa yozilmaydi");

  const byDate = (f) => [{ [f]: "asc" }, { id: "asc" }];
  const totals = { posted: 0, skipped: 0, failed: 0 };
  const add = (r) => {
    totals.posted += r.posted;
    totals.skipped += r.skipped;
    totals.failed += r.failed;
  };

  // 1) DEPOZITGA TO'LDIRISH — qoplashdan OLDIN bo'lishi shart.
  add(await runSource({
    label: "deposit_in",
    rows: await prisma.depositTransaction.findMany({
      where: { type: "topup", isDeleted: false, branchId: { not: null } },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postDepositTopup({ depositTransactionId: d.id }, null),
  }));

  // 2) DEPOZITDAN QAYTARISH
  add(await runSource({
    label: "deposit_out",
    rows: await prisma.depositTransaction.findMany({
      where: { type: "withdraw", isDeleted: false, branchId: { not: null } },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postDepositWithdraw({ depositTransactionId: d.id }, null),
  }));

  // 3) O'QUVCHI TO'LOVI (depozitdan qoplanganlar BUNDAN TASHQARI)
  add(await runSource({
    label: "payment",
    rows: await prisma.paymentTransaction.findMany({
      where: { isDeleted: false, source: { not: "deposit" } },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postStudentPayment({ paymentTransactionId: d.id }, null),
  }));

  // 4) DEPOZITDAN OYLIKKA QOPLASH
  add(await runSource({
    label: "deposit_apply",
    rows: await prisma.paymentTransaction.findMany({
      where: { isDeleted: false, source: "deposit" },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postDepositApply({ paymentTransactionId: d.id }, null),
  }));

  // 5) CHIQIM (filialsizlar jurnalga tushmaydi — qarang postExpense)
  add(await runSource({
    label: "expense",
    rows: await prisma.expense.findMany({
      where: { isDeleted: false, branchId: { not: null } },
      orderBy: byDate("spentAt"),
    }),
    post: (d) => financialTx.postExpense({ expenseId: d.id }, null),
  }));

  // 6) O'QITUVCHI MAOSHI
  add(await runSource({
    label: "salary_teacher",
    rows: await prisma.salaryTransaction.findMany({
      where: { isDeleted: false },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postTeacherPayroll({ salaryTransactionId: d.id }, null),
  }));

  // 7) XODIM MAOSHI
  add(await runSource({
    label: "salary_staff",
    rows: await prisma.staffSalaryTransaction.findMany({
      where: { isDeleted: false },
      orderBy: byDate("paidAt"),
    }),
    post: (d) => financialTx.postStaffPayroll({ staffSalaryTransactionId: d.id }, null),
  }));

  logger.info(totals, "Jurnal backfill yakunlandi");

  if (!isDry) {
    // TEKSHIRUV: ko'chirishdan keyin jurnal muvozanatda bo'lishi SHART.
    const check = await journal.reconcile();
    if (check.ok) logger.info("Tekshiruv: jurnal muvozanatda ✓");
    else logger.error({ check }, "TEKSHIRUV YIQILDI — jurnal nomuvozanat");
  }

  await disconnectDB();
};

seed().catch(async (err) => {
  logger.error({ err }, "Jurnal backfill xatosi");
  await disconnectDB();
  process.exit(1);
});
