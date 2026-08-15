import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import DepositTransaction from "../models/depositTransaction.model.js";
import Expense from "../models/expense.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import StaffSalaryTransaction from "../models/staffSalaryTransaction.model.js";
import JournalEntry from "../models/journalEntry.model.js";
import * as journal from "../modules/journal/services/journal.service.js";
import * as posting from "../helpers/journalPosting.helper.js";

// MIGRATSIYA: mavjud pul yozuvlarini JURNALGA ko'chirish.
//
// ══════════════════════════════════════════════════════════════════
// NEGA KERAK
// ══════════════════════════════════════════════════════════════════
// Jurnal (Faza 4) bo'sh holatda ishga tushdi. Ulanish qo'shilgach FAQAT
// YANGI to'lovlar unga tushadi - eski yillik tarix esa yo'q. Natijada
// "kassada qancha pul bor" savoliga jurnal NOL javob berardi, aslida
// kassada millionlab so'm bo'lsa ham.
//
// Bu skript butun tarixni qayta o'ynatadi.
//
// ══════════════════════════════════════════════════════════════════
// IDEMPOTENT
// ══════════════════════════════════════════════════════════════════
// Har bir hujjat uchun jurnalda `refModel` + `refId` bo'yicha yozuv
// bor-yo'qligi tekshiriladi. Bor bo'lsa - o'tkazib yuboriladi.
// Shuning uchun skriptni istalgancha qayta yugurtirish mumkin: u faqat
// YETISHMAYOTGANLARINI qo'shadi.
//
// Bu xususiyat ataylab: birinchi yugurish yarim yo'lda uzilsa
// (ulanish, xotira), ikkinchisi qolganini davom ettiradi.
//
// ══════════════════════════════════════════════════════════════════
// TARTIB MUHIM
// ══════════════════════════════════════════════════════════════════
// Depozitga to'ldirish QOPLASHDAN oldin yozilishi kerak - aks holda
// oraliq holatda depozit hisobi manfiy ko'rinardi. Sana bo'yicha
// saralash buni ta'minlaydi.
//
// ISHLATISH:
//   npm run migrate:journal-backfill
//   npm run migrate:journal-backfill -- --dry     (faqat sanaydi)

const isDry = process.argv.includes("--dry");

/** Shu hujjat allaqachon jurnalga tushganmi. */
const alreadyPosted = async (refModel, refId, kind = null) => {
  const filter = { refModel, refId };
  if (kind) filter.kind = kind;
  // To'lov va depozitdan qoplash BIR XIL refModel'da - turini
  // ko'rsatmaganda qoplash yozuvlari chiqarib tashlanadi.
  else if (refModel === "PaymentTransaction") filter.kind = { $ne: "deposit_apply" };

  return Boolean(await JournalEntry.exists(filter));
};

const runSource = async ({ label, model, filter, refModel, sort, post, kind }) => {
  const docs = await model.find(filter).sort(sort || { createdAt: 1 }).lean();

  let posted = 0;
  let skipped = 0;
  let failed = 0;

  for (const doc of docs) {
    if (await alreadyPosted(refModel, doc._id, kind)) {
      skipped += 1;
      continue;
    }
    if (isDry) {
      posted += 1;
      continue;
    }
    const entry = await post(doc);
    // postingHelper xatoni YUTADI va null qaytaradi (u yerda sabab
    // izohlangan). Migratsiyada esa buni SANASHIMIZ kerak - aks holda
    // "hammasi ko'chdi" degan yolg'on natija chiqardi.
    if (entry) posted += 1;
    else failed += 1;
  }

  logger.info(
    `${label}: ${docs.length} ta hujjat | ko'chirildi ${posted} | avvaldan bor ${skipped}` +
      (failed ? ` | XATO ${failed}` : ""),
  );

  return { label, total: docs.length, posted, skipped, failed };
};

const migrate = async () => {
  await connectDB();

  if (isDry) logger.info("QURUQ YURISH (--dry): hech narsa yozilmaydi");

  const notDeleted = { isDeleted: { $ne: true } };
  const withBranch = { branchId: { $ne: null } };

  const results = [];

  // ── 1) DEPOZITGA TO'LDIRISH (birinchi - qoplash undan keyin) ──
  results.push(
    await runSource({
      label: "Depozitga to'ldirish",
      model: DepositTransaction,
      filter: { type: "topup", ...notDeleted, ...withBranch },
      refModel: "DepositTransaction",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postDepositTopup(d, journal),
    }),
  );

  // ── 2) DEPOZITDAN YECHISH ──
  results.push(
    await runSource({
      label: "Depozitdan yechish",
      model: DepositTransaction,
      filter: { type: "withdraw", ...notDeleted, ...withBranch },
      refModel: "DepositTransaction",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postDepositWithdraw(d, journal),
    }),
  );

  // ── 3) O'QUVCHI TO'LOVI (naqd/terminal kirimi) ──
  results.push(
    await runSource({
      label: "O'quvchi to'lovi",
      model: PaymentTransaction,
      filter: { source: { $ne: "deposit" }, ...notDeleted, ...withBranch },
      refModel: "PaymentTransaction",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postPayment(d, journal),
    }),
  );

  // ── 4) DEPOZITDAN QOPLASH (pul harakati yo'q) ──
  results.push(
    await runSource({
      label: "Depozitdan qoplash",
      model: PaymentTransaction,
      filter: { source: "deposit", ...notDeleted, ...withBranch },
      refModel: "PaymentTransaction",
      kind: "deposit_apply",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postDepositApply(d, journal),
    }),
  );

  // ── 5) CHIQIMLAR ──
  results.push(
    await runSource({
      label: "Chiqimlar",
      model: Expense,
      filter: { ...notDeleted, ...withBranch },
      refModel: "Expense",
      sort: { spentAt: 1, createdAt: 1 },
      post: (d) => posting.postExpense(d, journal),
    }),
  );

  // ── 6) O'QITUVCHI MAOSHI ──
  results.push(
    await runSource({
      label: "O'qituvchi maoshi",
      model: SalaryTransaction,
      filter: { ...notDeleted, ...withBranch },
      refModel: "SalaryTransaction",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postSalary(d, journal, "SalaryTransaction"),
    }),
  );

  // ── 7) XODIM MAOSHI ──
  results.push(
    await runSource({
      label: "Xodim maoshi",
      model: StaffSalaryTransaction,
      filter: { ...notDeleted, ...withBranch },
      refModel: "StaffSalaryTransaction",
      sort: { paidAt: 1, createdAt: 1 },
      post: (d) => posting.postSalary(d, journal, "StaffSalaryTransaction"),
    }),
  );

  const totalPosted = results.reduce((s, r) => s + r.posted, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);

  logger.info(
    `YAKUN: ${totalPosted} ta yozuv ${isDry ? "ko'chirilishi kerak" : "ko'chirildi"}` +
      (totalFailed ? `, ${totalFailed} ta XATO` : ""),
  );

  if (!isDry) {
    // Muvozanat va filiallararo tenglikni darhol tekshiramiz.
    const rec = await journal.reconcile();
    if (rec.ok) {
      logger.info("Tekshiruv: jurnal muvozanatda, filiallararo balans teng");
    } else {
      logger.error(
        {
          unbalanced: rec.unbalancedEntries.length,
          interBranch: rec.interBranch.mismatches,
        },
        "TEKSHIRUV YIQILDI - jurnalda nomuvozanat bor",
      );
    }
  }

  await disconnectDB();
};

migrate().catch(async (err) => {
  logger.error({ err }, "Backfill yiqildi");
  try {
    await disconnectDB();
  } catch {
    /* ulanmagan bo'lsa e'tiborsiz */
  }
  process.exit(1);
});
