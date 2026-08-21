/**
 * TRANZAKSIYA TAFSILOTI + BYUDJET BOSHQARUVI (STEP 7).
 *
 * Ikki yangi imkoniyat tekshiriladi:
 *   1. `/finance-analytics/entries/:id` — tahlildan jurnal yozuvigacha
 *      kuzatish (traceability)
 *   2. byudjetni yaratish/tahrirlash — REJA, jurnalga yozilmaydi
 *
 * ISHLATISH:  npm run test:fin-entry
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as detail from "../src/modules/financeAnalytics/services/entryDetail.service.js";
import * as budgetSvc from "../src/modules/financeOps/services/budget.service.js";
import * as financialTx from "../src/modules/finance/services/financialTransaction.service.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { PERMISSIONS } from "../src/constants/permissions.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const mustThrow = async (n, fn, code) => {
  try { await fn(); bad(n, "xato kutilgan edi"); }
  catch (e) {
    if (code && e?.statusCode !== code) bad(n, `kutilgan ${code}, keldi ${e?.statusCode}: ${e.message}`);
    else ok(n, `${e?.statusCode} ${e.message.slice(0, 45)}`);
  }
};

const S = `ed${Date.now().toString(36)}`;
const made = { branches: [], users: [], groups: [], courses: [], rooms: [], cats: [], budgets: [] };

const cleanup = async () => {
  const b = made.branches;
  if (made.budgets.length) {
    await prisma.budgetLine.deleteMany({ where: { budgetId: { in: made.budgets } } });
    await prisma.budget.deleteMany({ where: { id: { in: made.budgets } } });
  }
  if (b.length) {
    await prisma.budgetLine.deleteMany({ where: { budget: { branchId: { in: b } } } });
    await prisma.budget.deleteMany({ where: { branchId: { in: b } } });
    const es = await prisma.journalEntry.findMany({ where: { branchId: { in: b } }, select: { id: true } });
    await prisma.journalLine.deleteMany({ where: { entryId: { in: es.map((e) => e.id) } } });
    await prisma.journalEntry.deleteMany({ where: { branchId: { in: b } } });
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: b } } });
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: b } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: b } } });
  }
  if (made.cats.length) await prisma.expenseCategory.deleteMany({ where: { id: { in: made.cats } } });
  if (made.groups.length) {
    // FK tartibi: a'zolik va o'qituvchi davri guruhdan OLDIN o'chadi.
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: made.groups } } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: made.groups } } });
    // `GroupFee` — oylik plan yaratilganda avtomatik paydo bo'ladi.
    await prisma.groupFee.deleteMany({ where: { groupId: { in: made.groups } } });
    await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
  }
  if (made.rooms.length) await prisma.room.deleteMany({ where: { id: { in: made.rooms } } });
  if (made.courses.length) await prisma.course.deleteMany({ where: { id: { in: made.courses } } });
  if (made.users.length) await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
};

const ALL = Object.values(PERMISSIONS);
const READ_ONLY = [PERMISSIONS.FINANCE_READ];

const run = async () => {
  console.log("\n=== TRANZAKSIYA TAFSILOTI + BYUDJET / STEP 7 ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const br = await prisma.branch.create({ data: { name: `ED ${S}` } });
  made.branches.push(br.id);
  const mk = async (n, role) => {
    const u = await prisma.user.create({ data: {
      firstName: n, lastName: "T", username: `${n.toLowerCase()}_${S}`,
      passwordHash: "x", role, homeBranchId: br.id } });
    made.users.push(u.id); return u;
  };
  const owner = await mk("Ega", "owner");
  const teacher = await mk("Ustoz", "teacher");
  const student = await mk("Talaba", "student");

  const course = await prisma.course.create({ data: { title: `IELTS ${S}`, code: `ie_${S}` } });
  made.courses.push(course.id);
  const room = await prisma.room.create({ data: { branchId: br.id, name: `R-${S}` } });
  made.rooms.push(room.id);
  const group = await prisma.group.create({ data: { branchId: br.id, name: `G-${S}`, courseId: course.id, roomId: room.id } });
  made.groups.push(group.id);
  await prisma.teacherGroupPeriod.create({ data: { teacherId: teacher.id, groupId: group.id, startDate: new Date(Date.UTC(2025, 0, 1)) } });
  const membership = await prisma.groupMembership.create({ data: { groupId: group.id, studentId: student.id, joinedAt: new Date(Date.UTC(2026, 0, 1)) } });

  const plan = await prisma.studentPayment.create({ data: {
    branchId: br.id, studentId: student.id, groupId: group.id, membershipId: membership.id,
    year: 2026, month: 8, baseFee: 700_000, expectedAmount: 700_000 } });

  // KOMISSIYALI TO'LOV — 700 000 / 7 000 / 693 000
  const tx = await prisma.paymentTransaction.create({ data: {
    branchId: br.id, paymentId: plan.id, studentId: student.id, groupId: group.id,
    year: 2026, month: 8, amount: 700_000, feeAmount: 7_000, provider: "Click",
    source: "direct", method: "click", paidAt: new Date(Date.UTC(2026, 7, 10)) } });
  const posted = await financialTx.postStudentPayment({ paymentTransactionId: tx.id }, owner);

  const ctx = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: true, userId: owner.id };
  const inBr = (fn) => runWithBranchContext(ctx, fn);

  // ══════════ 1) TO'LOV TAFSILOTI ══════════
  head("1) To'lov tafsiloti");
  const d = await inBr(() => detail.getEntryDetail(posted.entry.id, owner, ALL));
  eq("yozuv turi", d.kind, "payment");
  eq("turi o'zbekcha", d.kindLabel, "O'quvchi to'lovi");
  eq("summa (brutto)", d.amount, 700_000);
  eq("postingKey bor", d.postingKey?.startsWith("payment:"), true);
  eq("filial", d.branch?.id, br.id);

  head("1b) ANIQ debet/kredit qatorlari (700 000 / 7 000 / 693 000)");
  const dr = Object.fromEntries(d.accounting.debits.map((l) => [l.accountKind, l.debit]));
  const cr = Object.fromEntries(d.accounting.credits.map((l) => [l.accountKind, l.credit]));
  eq("Debet click (NETTO)", dr.click, 693_000);
  eq("Debet payment_fee", dr.payment_fee, 7_000);
  eq("Kredit revenue (BRUTTO)", cr.revenue, 700_000);
  eq("muvozanat", d.accounting.balanced, true);
  eq("hisob nomi o'zbekcha", d.accounting.debits.find((l) => l.accountKind === "click")?.accountLabel, "Click");

  head("1c) O'lchovlar — faqat MAVJUDLARI");
  eq("o'quvchi", d.dimensions.student?.id, student.id);
  eq("guruh", d.dimensions.group?.id, group.id);
  eq("yo'nalish", d.dimensions.course?.id, course.id);
  eq("xona", d.dimensions.room?.id, room.id);
  eq("o'qituvchi", d.dimensions.teacher?.id, teacher.id);
  eq("kanal", d.dimensions.paymentMethod, "click");
  eq("davr", `${d.dimensions.period?.year}-${d.dimensions.period?.month}`, "2026-8");
  eq("xodim o'lchovi YO'Q (bo'sh yorliq chizilmaydi)", "staff" in d.dimensions, false);
  eq("kategoriya o'lchovi YO'Q", "expenseCategory" in d.dimensions, false);

  head("1d) Manba hujjat");
  eq("manba modeli", d.source?.model, "PaymentTransaction");
  eq("manba mavjud", d.source?.exists, true);
  eq("manba brutto", d.source?.data?.gross, 700_000);
  eq("manba komissiya", d.source?.data?.fee, 7_000);
  eq("manba netto", d.source?.data?.net, 693_000);

  head("1e) Audit");
  eq("kim yaratdi", d.audit?.createdBy?.id, owner.id);
  eq("qachon", Boolean(d.audit?.createdAt), true);
  eq("audit yozuvlari bor", d.audit.logs.length > 0, true);

  // ══════════ 2) CHIQIM TAFSILOTI ══════════
  head("2) Chiqim tafsiloti");
  const cat = await prisma.expenseCategory.create({
    data: { name: `Ijara ${S}`, code: `rent_${S}`, kind: "operating", costType: "fixed" } });
  made.cats.push(cat.id);
  const exp = await prisma.expense.create({ data: {
    branchId: br.id, categoryId: cat.id, categoryName: cat.name, categoryKind: "operating",
    title: "Ijara avgust", amount: 800_000, spentAt: new Date(Date.UTC(2026, 7, 5)),
    accrualYear: 2026, accrualMonth: 8, method: "bank", vendor: "Arendator" } });
  const expPosted = await financialTx.postExpense({ expenseId: exp.id }, owner);
  const ed = await inBr(() => detail.getEntryDetail(expPosted.entry.id, owner, ALL));
  eq("chiqim turi", ed.kind, "expense");
  eq("Debet xarajat", ed.accounting.debits.find((l) => l.accountKind === "expense")?.debit, 800_000);
  eq("Kredit bank", ed.accounting.credits.find((l) => l.accountKind === "bank")?.credit, 800_000);
  eq("kategoriya o'lchovi", ed.dimensions.expenseCategory?.id, cat.id);
  eq("costType", ed.dimensions.costType, "fixed");
  eq("o'quvchi o'lchovi YO'Q (ijara)", "student" in ed.dimensions, false);
  eq("manba chiqim", ed.source?.data?.vendor, "Arendator");

  // ══════════ 3) MAOSH — RUXSAT CHEGARASI ══════════
  head("3) Maosh yozuvi — YON ESHIK YOPIQ");
  const sal = await prisma.teacherSalary.create({ data: {
    branchId: br.id, teacherId: teacher.id, groupId: group.id, year: 2026, month: 8,
    expectedAmount: 8_200_000 } });
  const salTx = await prisma.salaryTransaction.create({ data: {
    branchId: br.id, salaryId: sal.id, teacherId: teacher.id, groupId: group.id,
    year: 2026, month: 8, amount: 8_200_000, method: "cash", paidAt: new Date(Date.UTC(2026, 8, 5)) } });
  const salPosted = await financialTx.postTeacherPayroll({ salaryTransactionId: salTx.id }, owner);

  await mustThrow(
    "faqat finance.read bilan maosh yozuvi YOPIQ",
    () => inBr(() => detail.getEntryDetail(salPosted.entry.id, owner, READ_ONLY)),
    403,
  );
  const withSalary = await inBr(() =>
    detail.getEntryDetail(salPosted.entry.id, owner, [PERMISSIONS.FINANCE_READ, PERMISSIONS.SALARY_READ]));
  eq("salary.read bilan ochiladi", withSalary.amount, 8_200_000);
  const withPayroll = await inBr(() =>
    detail.getEntryDetail(salPosted.entry.id, owner, [PERMISSIONS.FINANCE_READ, PERMISSIONS.PAYROLL_READ]));
  eq("payroll.read bilan ham ochiladi", withPayroll.kind, "salary");
  eq("maosh o'qituvchiga bog'langan", withSalary.dimensions.teacher?.id, teacher.id);

  head("3b) To'lov yozuvi maosh ruxsatisiz OCHILADI");
  const payOnlyRead = await inBr(() => detail.getEntryDetail(posted.entry.id, owner, READ_ONLY));
  eq("to'lov finance.read bilan ochiladi", payOnlyRead.amount, 700_000);

  // ══════════ 4) TOPILMAGAN / BEGONA ══════════
  head("4) Xato holatlari");
  await mustThrow("mavjud bo'lmagan yozuv 404",
    () => inBr(() => detail.getEntryDetail("6a84000000000000000000ff", owner, ALL)), 404);

  const otherBranch = await prisma.branch.create({ data: { name: `ED B ${S}` } });
  made.branches.push(otherBranch.id);
  await mustThrow("begona filial yozuvi ko'rinmaydi (404)",
    () => runWithBranchContext(
      { branchId: otherBranch.id, allowedBranchIds: [otherBranch.id], canSeeAllBranches: false, userId: owner.id },
      () => detail.getEntryDetail(posted.entry.id, owner, ALL),
    ), 404);

  // ══════════ 5) BYUDJET BOSHQARUVI ══════════
  head("5) Byudjet — yaratish va tahrirlash");
  const jBefore = await prisma.journalEntry.count({ where: { branchId: br.id } });

  const created = await inBr(() => budgetSvc.createBudget({
    name: `Avgust ${S}`, branchId: br.id, periodType: "month", year: 2026, month: 8,
    status: "active",
    lines: [
      { scope: "total", amount: 50_000_000 },
      { scope: "category", categoryId: cat.id, amount: 8_000_000 },
      { scope: "kind", categoryKind: "payroll", amount: 30_000_000 },
    ],
  }, owner));
  made.budgets.push(created.id);
  eq("byudjet yaratildi", created.lines.length, 3);
  eq("oy saqlandi", created.month, 8);

  // ── BYUDJET JURNALGA YOZILMAYDI ──
  eq("JURNALGA YOZILMADI", await prisma.journalEntry.count({ where: { branchId: br.id } }), jBefore);

  const updated = await inBr(() => budgetSvc.updateBudget(created.id, {
    lines: [
      { scope: "total", amount: 55_000_000 },
      { scope: "category", categoryId: cat.id, amount: 9_000_000 },
    ],
  }, owner));
  eq("qatorlar almashtirildi", updated.lines.length, 2);
  eq("summa yangilandi", updated.lines.find((l) => l.scope === "total")?.amount, 55_000_000);

  head("5b) Byudjet validatsiyasi");
  await mustThrow("kategoriyasiz `category` qatori rad etiladi",
    () => inBr(() => budgetSvc.createBudget({
      branchId: br.id, year: 2026, month: 9,
      lines: [{ scope: "category", amount: 1000 }] }, owner)), 400);
  await mustThrow("manfiy summa rad etiladi",
    () => inBr(() => budgetSvc.createBudget({
      branchId: br.id, year: 2026, month: 10,
      lines: [{ scope: "total", amount: -5 }] }, owner)), 400);
  await mustThrow("bir davrga ikkinchi byudjet rad etiladi",
    () => inBr(() => budgetSvc.createBudget({
      branchId: br.id, year: 2026, month: 8, lines: [] }, owner)), 409);

  head("5c) Byudjet o'chirish — YUMSHOQ");
  await inBr(() => budgetSvc.removeBudget(created.id, owner));
  const afterDelete = await prisma.budget.findUnique({ where: { id: created.id } });
  eq("hujjat saqlanib qoldi", Boolean(afterDelete), true);
  eq("isDeleted bayrog'i", afterDelete.isDeleted, true);

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
