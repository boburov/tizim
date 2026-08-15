/**
 * JURNALNI MAVJUD OQIMLARGA ULASH (Faza 4b).
 *
 * SAVOL: "To'lov qabul qilinganda jurnalga ham yoziladimi - va u
 * haqiqiy pul harakatini TO'G'RI ifodalaydimi?"
 *
 * ENG NOZIK JOY - DEPOZIT. U ikki bosqichli:
 *   to'ldirish: pul KIRDI, lekin DAROMAD EMAS (o'quvchiniki)
 *   qoplash:    pul HARAKATLANMADI, lekin endi DAROMAD
 *
 * Bu chalkashtirilsa tushum ikki barobar ko'rinardi: bir marta
 * to'ldirishda, ikkinchi marta qoplashda.
 *
 * IZOLYATSIYA: o'z test bazasini yaratadi va oxirida O'CHIRADI.
 *
 * ISHLATISH:
 *   npm run test:journal-wiring
 */
import "dotenv/config";
import mongoose from "mongoose";

const BASE = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
const DB = BASE.replace(/\/([^/?]+)(\?|$)/, "/bayyina_wiring_test$2");

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const check = (n, cond, d = "shart bajarilmadi") => (cond ? ok(n) : bad(n, d));
const money = (n) => new Intl.NumberFormat("uz-UZ").format(n || 0);

const run = async () => {
  if (DB === BASE) throw new Error("Test bazasi nomi ajratilmadi - to'xtatildi");
  mongoose.set("autoIndex", false);
  await mongoose.connect(DB);
  if (!mongoose.connection.name.includes("wiring_test")) {
    throw new Error(`Kutilmagan baza: ${mongoose.connection.name}`);
  }
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const Account = (await import("../src/models/account.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js"))
    .default;
  const DepositTransaction = (await import("../src/models/depositTransaction.model.js"))
    .default;
  const Expense = (await import("../src/models/expense.model.js")).default;
  await Account.syncIndexes();

  const journal = await import("../src/modules/journal/services/journal.service.js");
  const posting = await import("../src/helpers/journalPosting.helper.js");
  const verifyService = await import(
    "../src/modules/journal/services/journalVerify.service.js"
  );
  const { ACCOUNT_KINDS } = await import("../src/constants/ledger.js");

  const A = await Branch.create({ name: "A filial", isMain: true });

  const cashOf = () => journal.accountBalance(A._id, ACCOUNT_KINDS.CASH);
  const revenueOf = () => journal.accountBalance(A._id, ACCOUNT_KINDS.REVENUE);
  const depositOf = () => journal.accountBalance(A._id, ACCOUNT_KINDS.DEPOSIT);

  const sid = new mongoose.Types.ObjectId();
  const gid = new mongoose.Types.ObjectId();
  const pid = new mongoose.Types.ObjectId();

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) TO'G'RIDAN-TO'G'RI TO'LOV\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const pay = await PaymentTransaction.create({
    branchId: A._id,
    payment: pid,
    student: sid,
    group: gid,
    year: 2026,
    month: 8,
    amount: 1_000_000,
    source: "direct",
    method: "cash",
    paidAt: new Date(),
  });
  await posting.postPayment(pay, journal);

  check("Naqd kirdi", (await cashOf()) === 1_000_000, `naqd: ${money(await cashOf())}`);
  check("Daromad yozildi", (await revenueOf()) === 1_000_000);

  const byCard = await PaymentTransaction.create({
    branchId: A._id,
    payment: pid,
    student: sid,
    group: gid,
    year: 2026,
    month: 8,
    amount: 400_000,
    source: "direct",
    method: "card",
    paidAt: new Date(),
  });
  await posting.postPayment(byCard, journal);

  check(
    "Terminal to'lovi NAQDGA tushmadi",
    (await cashOf()) === 1_000_000,
    "to'lov usuli e'tiborga olinmagan",
  );
  check(
    "Terminal hisobiga tushdi",
    (await journal.accountBalance(A._id, ACCOUNT_KINDS.TERMINAL)) === 400_000,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) DEPOZIT - ikki bosqich\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const revenueBefore = await revenueOf();

  const topup = await DepositTransaction.create({
    branchId: A._id,
    student: sid,
    deposit: new mongoose.Types.ObjectId(),
    type: "topup",
    amount: 600_000,
    method: "cash",
    balanceAfter: 600_000,
    paidAt: new Date(),
  });
  await posting.postDepositTopup(topup, journal);

  check(
    "To'ldirishda naqd KIRDI",
    (await cashOf()) === 1_600_000,
    `naqd: ${money(await cashOf())}`,
  );
  check(
    "To'ldirish DAROMAD EMAS",
    (await revenueOf()) === revenueBefore,
    "tushum oldindan ko'tarilib ko'rindi - o'quvchi pulini qaytarsa manfiy daromad chiqardi",
  );
  check(
    "Depozit majburiyati o'sdi",
    (await depositOf()) === 600_000,
    `depozit: ${money(await depositOf())}`,
  );

  // Endi qoplash - PUL HARAKATI YO'Q.
  const cashBeforeApply = await cashOf();
  const applied = await PaymentTransaction.create({
    branchId: A._id,
    payment: pid,
    student: sid,
    group: gid,
    year: 2026,
    month: 8,
    amount: 600_000,
    source: "deposit",
    method: "cash",
    paidAt: new Date(),
  });
  await posting.postDepositApply(applied, journal);

  check(
    "Qoplashda naqd O'ZGARMADI",
    (await cashOf()) === cashBeforeApply,
    `${money(cashBeforeApply)} -> ${money(await cashOf())} — pul ikki marta sanaldi`,
  );
  check(
    "Qoplashda daromad o'sdi",
    (await revenueOf()) === revenueBefore + 600_000,
  );
  check(
    "Depozit majburiyati yopildi",
    (await depositOf()) === 0,
    `depozit: ${money(await depositOf())}`,
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) CHIQIM\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const cashBeforeExpense = await cashOf();
  const exp = await Expense.create({
    branchId: A._id,
    category: new mongoose.Types.ObjectId(),
    title: "Ijara",
    amount: 500_000,
    method: "cash",
    spentAt: new Date(),
    accrualYear: 2026,
    accrualMonth: 8,
  });
  await posting.postExpense(exp, journal);

  check(
    "Chiqimda naqd kamaydi",
    (await cashOf()) === cashBeforeExpense - 500_000,
    `${money(cashBeforeExpense)} -> ${money(await cashOf())}`,
  );
  check(
    "Xarajat hisobi o'sdi",
    (await journal.accountBalance(A._id, ACCOUNT_KINDS.EXPENSE)) === 500_000,
  );

  // FILIALSIZ chiqim jurnalga TUSHMAYDI.
  const noBranch = await Expense.create({
    category: new mongoose.Types.ObjectId(),
    title: "Markaz reklamasi",
    amount: 999_999,
    method: "cash",
    spentAt: new Date(),
    accrualYear: 2026,
    accrualMonth: 8,
  });
  const entry = await posting.postExpense(noBranch, journal);
  check(
    "Filialsiz chiqim jurnalga tushmaydi",
    entry === null,
    "yozuv doim bitta filialga tegishli bo'lishi shart",
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) MUVOZANAT VA TEKSHIRUV\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const rec = await journal.reconcile();
  check("Barcha yozuvlar muvozanatda", rec.ok, JSON.stringify(rec.unbalancedEntries));

  const v = await verifyService.verify();
  check(
    "verify(): hamma hujjat jurnalga tushgan",
    v.ok,
    `yetishmaydi: ${v.totalMissing} — ${JSON.stringify(
      v.sources.filter((s) => s.missing).map((s) => `${s.key}:${s.missing}`),
    )}`,
  );

  // ── Ulanmagan hujjat YARATIB, verify uni TOPISHINI tekshiramiz ──
  await PaymentTransaction.create({
    branchId: A._id,
    payment: pid,
    student: sid,
    group: gid,
    year: 2026,
    month: 9,
    amount: 123_456,
    source: "direct",
    method: "cash",
    paidAt: new Date(),
  });
  // ATAYLAB posting chaqirilmadi - "ulashni unutish" holati.

  const vBad = await verifyService.verify();
  check(
    "verify() UNUTILGAN yozuvni topadi",
    !vBad.ok && vBad.totalMissing === 1,
    `topilgan: ${vBad.totalMissing}`,
  );
  check(
    "Qaysi manba ekani ko'rsatiladi",
    vBad.sources.find((s) => s.key === "payment")?.missing === 1,
    JSON.stringify(vBad.sources.map((s) => `${s.key}:${s.missing}`)),
  );

  // ─────────────────────────────────────────────────────────
  console.log("\n\x1b[1m5) BACKFILL IDEMPOTENTLIGI\x1b[0m");
  // ─────────────────────────────────────────────────────────

  const JournalEntry = (await import("../src/models/journalEntry.model.js")).default;
  const beforeCount = await JournalEntry.countDocuments();

  // Allaqachon yozilgan to'lovni QAYTA yozishga urinamiz - backfill
  // mantiqi (refModel + refId bo'yicha mavjudlik) buni to'sishi kerak.
  const exists = await JournalEntry.exists({
    refModel: "PaymentTransaction",
    refId: pay._id,
    kind: { $ne: "deposit_apply" },
  });
  check("Mavjudlik tekshiruvi ishlaydi", Boolean(exists));

  // Yetishmayotganini qo'shamiz.
  const missing = await PaymentTransaction.findOne({ month: 9 }).lean();
  await posting.postPayment(missing, journal);
  const afterCount = await JournalEntry.countDocuments();
  check("Yetishmayotgan yozuv qo'shildi", afterCount === beforeCount + 1);

  const vFixed = await verifyService.verify();
  check("Tuzatgandan keyin verify() toza", vFixed.ok, `${vFixed.totalMissing} qoldi`);

  // ── Yakun ──
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.fail) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  • ${n}`));
    process.exit(1);
  }
};

run().catch(async (err) => {
  console.error("\x1b[31mTEST YIQILDI:\x1b[0m", err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ulanmagan bo'lsa e'tiborsiz */
  }
  process.exit(1);
});
