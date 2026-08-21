/**
 * MOLIYAVIY AMALLAR (STEP 6) — qaytarim / o'tkazma / egasining puli.
 *
 * Bu endpoint'lar STEP 5.1 da yaratilgan ruxsatlarni ISHGA TUSHIRADI:
 * ilgari `finance.manage_refunds` va `finance.manage_transfers`
 * hech narsani qo'riqlamasdi, chunki bu amallarning HTTP yuzasi
 * yo'q edi.
 *
 * ISHLATISH:  npm run test:fin-ops
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as ops from "../src/modules/financeOps/services/financeOps.service.js";
import * as financialTx from "../src/modules/finance/services/financialTransaction.service.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { refundSchema, transferSchema, ownerCapitalSchema } from "../src/modules/financeOps/validators/financeOps.validator.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const mustThrow = async (n, fn, match) => {
  try { await fn(); bad(n, "xato kutilgan edi"); }
  catch (e) {
    const m = e?.message || "";
    if (match && !m.toLowerCase().includes(match.toLowerCase())) bad(n, `boshqa xato: ${m.slice(0, 70)}`);
    else ok(n, m.split("\n")[0].slice(0, 55));
  }
};

const S = `fo${Date.now().toString(36)}`;
const made = { branches: [], users: [], groups: [] };

const cleanup = async () => {
  const b = made.branches;
  if (b.length) {
    const es = await prisma.journalEntry.findMany({ where: { branchId: { in: b } }, select: { id: true } });
    await prisma.journalLine.deleteMany({ where: { entryId: { in: es.map((e) => e.id) } } });
    await prisma.journalEntry.deleteMany({ where: { branchId: { in: b } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.refund.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: b } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: b } } });
  }
  if (made.groups.length) await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
  if (made.users.length) await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
};

const run = async () => {
  console.log("\n=== MOLIYAVIY AMALLAR / STEP 6 ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const br = await prisma.branch.create({ data: { name: `FO ${S}` } });
  const brB = await prisma.branch.create({ data: { name: `FO B ${S}` } });
  made.branches.push(br.id, brB.id);
  const mk = async (n, role, b) => {
    const u = await prisma.user.create({ data: {
      firstName: n, lastName: "T", username: `${n.toLowerCase()}_${S}`,
      passwordHash: "x", role, homeBranchId: b } });
    made.users.push(u.id); return u;
  };
  const owner = await mk("Ega", "owner", br.id);
  const stu = await mk("Talaba", "student", br.id);
  const stuB = await mk("TalabaB", "student", brB.id);
  const grp = await prisma.group.create({ data: { branchId: br.id, name: `G${S}` } });
  made.groups.push(grp.id);

  const plan = await prisma.studentPayment.create({ data: {
    branchId: br.id, studentId: stu.id, groupId: grp.id, year: 2026, month: 8,
    baseFee: 700_000, expectedAmount: 700_000 } });
  const tx = await prisma.paymentTransaction.create({ data: {
    branchId: br.id, paymentId: plan.id, studentId: stu.id, groupId: grp.id,
    year: 2026, month: 8, amount: 700_000, source: "direct", method: "cash", paidAt: new Date() } });
  await financialTx.postStudentPayment({ paymentTransactionId: tx.id }, owner);

  const ctx = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: true, userId: owner.id };
  const inBr = (fn) => runWithBranchContext(ctx, fn);

  // ══════════ 1) VALIDATSIYA ══════════
  head("1) Kirish validatsiyasi");
  eq("kasr summa rad etiladi",
    refundSchema.safeParse({ body: { studentId: stu.id, amount: 100.5, method: "cash", reason: "sinov" } }).success, false);
  eq("manfiy summa rad etiladi",
    transferSchema.safeParse({ body: { fromMethod: "cash", toMethod: "bank", amount: -5 } }).success, false);
  eq("bir xil hisob rad etiladi",
    transferSchema.safeParse({ body: { fromMethod: "cash", toMethod: "cash", amount: 100 } }).success, false);
  eq("noma'lum kanal rad etiladi",
    transferSchema.safeParse({ body: { fromMethod: "bitcoin", toMethod: "cash", amount: 100 } }).success, false);
  eq("qisqa sabab rad etiladi",
    refundSchema.safeParse({ body: { studentId: stu.id, amount: 100, method: "cash", reason: "x" } }).success, false);
  eq("to'g'ri o'tkazma qabul qilinadi",
    transferSchema.safeParse({ body: { fromMethod: "bank", toMethod: "cash", amount: 500000 } }).success, true);
  eq("noma'lum yo'nalish rad etiladi",
    ownerCapitalSchema.safeParse({ body: { direction: "loan", amount: 100, method: "cash" } }).success, false);

  // ══════════ 2) QAYTARIM ══════════
  head("2) Qaytarim");
  const rf = await inBr(() => ops.createRefund({
    studentId: stu.id, originalTransactionId: tx.id, amount: 200_000,
    method: "cash", reason: "Kursni tark etdi" }, owner));
  eq("holat executed", rf.status, "executed");
  eq("jurnal yozuviga bog'landi", Boolean(rf.journalEntryId), true);
  const planAfter = await prisma.studentPayment.findUnique({ where: { id: plan.id } });
  // ASL TO'LOV TEGILMAYDI — bu STEP 4 qoidasi.
  eq("asl to'lov paidAmount O'ZGARMADI", planAfter.paidAmount, 0);
  const origTx = await prisma.paymentTransaction.findUnique({ where: { id: tx.id } });
  eq("asl tranzaksiya summasi o'zgarmadi", origTx.amount, 700_000);

  await mustThrow("to'langandan ortiq qaytarib bo'lmaydi",
    () => inBr(() => ops.createRefund({
      studentId: stu.id, originalTransactionId: tx.id, amount: 600_000,
      method: "cash", reason: "ortiqcha" }, owner)), "oshib ketdi");

  await mustThrow("boshqa o'quvchining to'lovi rad etiladi",
    () => inBr(() => ops.createRefund({
      studentId: stuB.id, originalTransactionId: tx.id, amount: 10_000,
      method: "cash", reason: "sinov" }, owner)), "boshqa o'quvchiga");

  // ══════════ 3) O'TKAZMA ══════════
  head("3) Ichki o'tkazma");
  const t1 = await inBr(() => ops.createTransfer({
    branchId: br.id, fromMethod: "cash", toMethod: "bank",
    amount: 100_000, idempotencyKey: `${S}-t1` }, owner));
  eq("yozildi", Boolean(t1.entryId), true);
  const t2 = await inBr(() => ops.createTransfer({
    branchId: br.id, fromMethod: "cash", toMethod: "bank",
    amount: 100_000, idempotencyKey: `${S}-t1` }, owner));
  eq("IDEMPOTENT (takror yozilmadi)", t2.duplicate, true);
  eq("o'sha yozuv qaytarildi", t2.entryId, t1.entryId);

  // ══════════ 4) EGASINING PULI ══════════
  head("4) Egasining puli");
  const inv = await inBr(() => ops.createOwnerCapital({
    direction: "investment", branchId: br.id, amount: 5_000_000,
    method: "bank", idempotencyKey: `${S}-i1` }, owner));
  eq("investitsiya yozildi", Boolean(inv.entryId), true);
  const wd = await inBr(() => ops.createOwnerCapital({
    direction: "withdrawal", branchId: br.id, amount: 1_000_000,
    method: "cash", idempotencyKey: `${S}-w1` }, owner));
  eq("yechish yozildi", Boolean(wd.entryId), true);
  const dup = await inBr(() => ops.createOwnerCapital({
    direction: "investment", branchId: br.id, amount: 5_000_000,
    method: "bank", idempotencyKey: `${S}-i1` }, owner));
  eq("IDEMPOTENT", dup.duplicate, true);

  const cap = await journal.accountBalance(br.id, "owner_capital");
  eq("egasi kapitali (5M − 1M)", cap, 4_000_000);

  // DAROMAD/XARAJATGA TEGMAGANI
  const rev = await journal.accountBalance(br.id, "revenue");
  eq("daromad faqat to'lov − qaytarim", rev, 500_000);

  // ══════════ 5) AUDIT ══════════
  head("5) Audit izi");
  const audits = await prisma.financialAuditLog.findMany({ where: { branchId: br.id } });
  const types = [...new Set(audits.map((a) => a.entityType))].sort();
  eq("qaytarim auditda", types.includes("Refund"), true);
  eq("o'tkazma auditda", types.includes("AccountTransfer"), true);
  eq("egasi puli auditda", types.includes("OwnerCapital"), true);

  // ══════════ 6) JURNAL BUTUNLIGI ══════════
  head("6) Jurnal butunligi");
  const rec = await journal.reconcile();
  eq("reconcile ok", rec.ok, true);

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
  if (R.failures.length) { console.log("Muammolar:"); for (const f of R.failures) console.log("  • " + f); }
};

run()
  .catch((e) => { console.error("\nTEST YIQILDI:", e); R.fail += 1; })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
