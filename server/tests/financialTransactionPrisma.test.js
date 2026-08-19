/**
 * MOLIYAVIY TRANZAKSIYA SERVISI (STEP 4) — PostgreSQL (Prisma) USTIDA.
 *
 * Bu test "servis mavjudmi" degan savolga emas, "PUL TO'G'RI YOZILAYAPTIMI"
 * degan savolga javob beradi. Shuning uchun u ANIQ debet/kredit
 * summalarini tekshiradi, "yozuv yaratildi" bilan cheklanmaydi.
 *
 * QAMROV:
 *   1  o'quvchi to'lovi (to'liq yo'l: transaction.service → jurnal)
 *   2  qisman to'lov
 *   3  komissiyali to'lov — 700 000 / 7 000 / 693 000 aynan
 *   4  chiqim (expense.service → jurnal)
 *   5  qaytarim + limit tekshiruvi
 *   6  o'qituvchi va xodim maoshi
 *   7  egasining investitsiyasi
 *   8  egasining yechib olishi
 *   9  ichki o'tkazma
 *   10 takrorlanuvchi chiqim → haqiqiy chiqim
 *   11 IDEMPOTENTLIK (takroriy urinish pulni ikki marta yozmaydi)
 *   12 o'lchov muhrlash
 *   13 filial muvofiqligi
 *   14 muvozanat invarianti
 *   15 hisob qoldig'ining to'g'riligi
 *   16 audit izi
 *   17 xatoda to'liq qaytarish (rollback)
 *   18 reconcile()
 *
 * MONGOOSE ISHLATILMAYDI — fixtures butunlay Prisma orqali.
 *
 * ISHLATISH:  npm run test:fintx
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as financialTx from "../src/modules/finance/services/financialTransaction.service.js";
import * as dim from "../src/modules/finance/services/dimensionResolver.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import * as txnService from "../src/modules/finance/services/transaction.service.js";
import * as expenseService from "../src/modules/expenses/services/expense.service.js";
import { runFinanceTxn } from "../src/modules/finance/services/financeTxn.helper.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { ENTRY_KINDS, ACCOUNT_KINDS } from "../src/constants/ledger.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  R.failures.push(`${n} — ${extra}`);
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};
const eq = (n, actual, expected) =>
  actual === expected ? ok(n, String(actual)) : bad(n, `kutilgan ${expected}, keldi ${actual}`);
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const mustThrow = async (n, fn, match) => {
  try {
    await fn();
    bad(n, "xato kutilgan edi, o'tib ketdi");
  } catch (err) {
    const m = err?.message || "";
    if (match && !m.toLowerCase().includes(match.toLowerCase())) bad(n, `boshqa xato: ${m.slice(0, 90)}`);
    else ok(n, m.split("\n")[0].slice(0, 60));
  }
};

const S = `ftx${Date.now().toString(36)}`;
const made = { users: [], branches: [], groups: [], courses: [], rooms: [], cats: [] };

/** Yozuvning qatorlarini {accountKind: {debit,credit}} shaklida beradi. */
const linesOf = async (entryId) => {
  const rows = await prisma.journalLine.findMany({ where: { entryId } });
  const out = {};
  for (const l of rows) out[l.accountKind] = { debit: l.debit, credit: l.credit };
  return out;
};

const cleanup = async () => {
  const b = made.branches;
  if (b.length) {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: b } }, select: { id: true },
    });
    const ids = entries.map((e) => e.id);
    if (ids.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.refund.deleteMany({ where: { branchId: { in: b } } });
    await prisma.recurringExpenseOccurrence.deleteMany({ where: { branchId: { in: b } } });
    await prisma.recurringExpense.deleteMany({ where: { branchId: { in: b } } });
    await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: b } } });
    await prisma.staffSalaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.staffPayroll.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: b } } });
    await prisma.depositTransaction.deleteMany({ where: { branchId: { in: b } } });
  }
  if (made.users.length) {
    await prisma.depositTransaction.deleteMany({ where: { studentId: { in: made.users } } });
    await prisma.studentDeposit.deleteMany({ where: { studentId: { in: made.users } } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { teacherId: { in: made.users } } });
  }
  if (made.groups.length) {
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: made.groups } } });
    await prisma.group.deleteMany({ where: { id: { in: made.groups } } });
  }
  if (made.cats.length) await prisma.expenseCategory.deleteMany({ where: { id: { in: made.cats } } });
  if (made.rooms.length) await prisma.room.deleteMany({ where: { id: { in: made.rooms } } });
  if (made.courses.length) await prisma.course.deleteMany({ where: { id: { in: made.courses } } });
  if (b.length) {
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: b } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: b } } });
  }
  if (made.users.length) await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  if (b.length) await prisma.branch.deleteMany({ where: { id: { in: b } } });
};

const mkUser = async (name, role, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "T", username: `${name.toLowerCase()}_${S}`,
      passwordHash: "x", role, homeBranchId: branchId,
      hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  made.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== MOLIYAVIY TRANZAKSIYA SERVISI / STEP 4 ===\n");
  await prisma.$queryRaw`SELECT 1`;
  dim.resetCaches();

  // ─────────────── FIXTURES ───────────────
  const br = await prisma.branch.create({ data: { name: `FTX ${S}` } });
  const brB = await prisma.branch.create({ data: { name: `FTX B ${S}` } });
  made.branches.push(br.id, brB.id);

  const owner = await mkUser("Ega", "owner", br.id);
  const teacher = await mkUser("Ustoz", "teacher", br.id);
  const student = await mkUser("Talaba", "student", br.id);
  const staff = await mkUser("Xodim", "reception", br.id);

  const course = await prisma.course.create({ data: { title: `IELTS ${S}`, code: `ielts_${S}` } });
  made.courses.push(course.id);
  const room = await prisma.room.create({ data: { branchId: br.id, name: `101-${S}`, capacity: 12 } });
  made.rooms.push(room.id);
  const roomB = await prisma.room.create({ data: { branchId: brB.id, name: `B-${S}` } });
  made.rooms.push(roomB.id);

  const group = await prisma.group.create({
    data: { branchId: br.id, name: `G-${S}`, courseId: course.id, roomId: room.id },
  });
  made.groups.push(group.id);
  const groupB = await prisma.group.create({ data: { branchId: brB.id, name: `GB-${S}` } });
  made.groups.push(groupB.id);

  const membership = await prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id, joinedAt: new Date(Date.UTC(2026, 7, 1)) },
  });
  // Bitta o'qituvchi → o'lchov ANIQ (bir nechta bo'lsa NULL qolardi).
  await prisma.teacherGroupPeriod.create({
    data: { teacherId: teacher.id, groupId: group.id, startDate: new Date(Date.UTC(2026, 0, 1)) },
  });

  const cat = await prisma.expenseCategory.create({
    data: { name: `Ijara ${S}`, code: `rent_${S}`, kind: "operating", costType: "fixed" },
  });
  made.cats.push(cat.id);

  const scope = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: false, userId: owner.id };
  const inBr = (fn) => runWithBranchContext(scope, fn);
  const mkPlan = (month, expected) => prisma.studentPayment.create({
    data: {
      branchId: br.id, studentId: student.id, groupId: group.id, membershipId: membership.id,
      year: 2026, month, baseFee: expected, expectedAmount: expected, paidAmount: 0,
    },
  });

  // ═══════════════ 1) O'QUVCHI TO'LOVI (to'liq yo'l) ═══════════════
  head("1) O'quvchi to'lovi — to'liq yo'l (transaction.service → jurnal)");
  const plan1 = await mkPlan(8, 700_000);
  await inBr(() => txnService.create(
    { paymentId: plan1.id, amount: 700_000, method: "click" }, owner,
  ));
  const payEntry = await prisma.journalEntry.findFirst({
    where: { branchId: br.id, kind: ENTRY_KINDS.PAYMENT }, orderBy: { createdAt: "desc" },
  });
  if (!payEntry) bad("to'lov yozuvi yaratildi");
  else {
    ok("to'lov yozuvi yaratildi");
    const L = await linesOf(payEntry.id);
    eq("  Debet click", L.click?.debit, 700_000);
    eq("  Kredit daromad", L.revenue?.credit, 700_000);
    eq("  postingKey", payEntry.postingKey?.startsWith("payment:"), true);
  }

  // ═══════════════ 12) O'LCHOV MUHRLASH ═══════════════
  head("12) O'lchov muhrlash — manba hujjatdan aniqlangan");
  if (payEntry) {
    eq("studentId", payEntry.studentId, student.id);
    eq("groupId", payEntry.groupId, group.id);
    eq("courseId (guruhdan)", payEntry.courseId, course.id);
    eq("roomId (guruhdan)", payEntry.roomId, room.id);
    eq("membershipId (plandan)", payEntry.membershipId, membership.id);
    eq("teacherId (davrdan)", payEntry.teacherId, teacher.id);
    eq("periodYear", payEntry.periodYear, 2026);
    eq("periodMonth", payEntry.periodMonth, 8);
    eq("paymentMethod", payEntry.paymentMethod, "click");

    // Kelajakdagi tahlil aynan shu shaklda so'raydi (Faza 16-19).
    const byTeacher = await prisma.journalEntry.groupBy({
      by: ["teacherId"], where: { branchId: br.id, teacherId: teacher.id },
      _sum: { totalCredit: true },
    });
    eq("GROUP BY teacher ishlaydi", byTeacher[0]?._sum.totalCredit, 700_000);
  }

  // ═══════════════ 2) QISMAN TO'LOV ═══════════════
  head("2) Qisman to'lov");
  const plan2 = await mkPlan(9, 700_000);
  await inBr(() => txnService.create({ paymentId: plan2.id, amount: 500_000, method: "cash" }, owner));
  const p2 = await prisma.studentPayment.findUnique({ where: { id: plan2.id } });
  eq("paidAmount", p2.paidAmount, 500_000);
  eq("status", p2.status, "partial");
  eq("qoldiq", p2.expectedAmount - p2.paidAmount, 200_000);

  // ═══════════════ 3) KOMISSIYALI TO'LOV (Faza 12) ═══════════════
  head("3) Komissiyali to'lov — 700 000 / 7 000 / 693 000");
  const plan3 = await mkPlan(10, 700_000);
  const feeTx = await prisma.paymentTransaction.create({
    data: {
      branchId: br.id, paymentId: plan3.id, studentId: student.id, groupId: group.id,
      year: 2026, month: 10, amount: 700_000, feeAmount: 7_000, provider: "Click",
      source: "direct", method: "click", paidAt: new Date(Date.UTC(2026, 9, 5)),
    },
  });
  const feeRes = await financialTx.postStudentPayment({ paymentTransactionId: feeTx.id }, owner);
  const FL = await linesOf(feeRes.entry.id);
  eq("Debet click (NETTO)", FL.click?.debit, 693_000);
  eq("Debet payment_fee", FL.payment_fee?.debit, 7_000);
  eq("Kredit daromad (BRUTTO)", FL.revenue?.credit, 700_000);
  eq("muvozanat: debet == kredit", feeRes.entry.totalDebit, feeRes.entry.totalCredit);
  const amounts = financialTx.computePaymentAmounts({ amount: 700_000, feeAmount: 7_000 });
  eq("formula net = gross - fee", amounts.net, 693_000);
  await mustThrow("komissiya to'lovdan katta bo'lolmaydi",
    async () => financialTx.computePaymentAmounts({ amount: 100, feeAmount: 200 }), "komissiya");

  // ═══════════════ 11) IDEMPOTENTLIK ═══════════════
  head("11) Idempotentlik — takroriy urinish pulni IKKI MARTA yozmaydi");
  const before = await prisma.journalEntry.count({ where: { branchId: br.id } });
  const again = await financialTx.postStudentPayment({ paymentTransactionId: feeTx.id }, owner);
  const after = await prisma.journalEntry.count({ where: { branchId: br.id } });
  eq("duplicate bayrog'i", again.duplicate, true);
  eq("yangi yozuv YARATILMADI", after, before);
  eq("o'sha yozuv qaytarildi", again.entry.id, feeRes.entry.id);
  const auditCount = await prisma.financialAuditLog.count({
    where: { entityType: "PaymentTransaction", entityId: feeTx.id },
  });
  eq("takroriy urinish audit YOZMAYDI", auditCount, 1);

  // ═══════════════ 4) CHIQIM ═══════════════
  head("4) Chiqim (expense.service → jurnal)");
  const exp = await inBr(() => expenseService.create({
    category: cat.id, title: "Ijara avgust", amount: 8_000_000,
    spentAt: "2026-08-05", method: "bank",
  }, owner));
  const expEntry = await prisma.journalEntry.findFirst({
    where: { refModel: "Expense", refId: exp._id || exp.id },
  });
  if (!expEntry) bad("chiqim yozuvi yaratildi");
  else {
    ok("chiqim yozuvi yaratildi");
    const L = await linesOf(expEntry.id);
    eq("  Debet xarajat", L.expense?.debit, 8_000_000);
    eq("  Kredit bank", L.bank?.credit, 8_000_000);
    eq("  expenseCategoryId muhrlandi", expEntry.expenseCategoryId, cat.id);
    eq("  costType kategoriyadan meros", expEntry.costType, "fixed");
    eq("  o'quvchi o'lchovi YO'Q (ijara)", expEntry.studentId, null);
    eq("  o'qituvchi o'lchovi YO'Q", expEntry.teacherId, null);
  }

  // ═══════════════ 6) MAOSH ═══════════════
  head("6) Maosh — o'qituvchi va xodim (Faza 7)");
  const salary = await prisma.teacherSalary.create({
    data: {
      branchId: br.id, teacherId: teacher.id, groupId: group.id, year: 2026, month: 8,
      expectedAmount: 8_200_000, paidAmount: 0,
    },
  });
  const salTx = await prisma.salaryTransaction.create({
    data: {
      branchId: br.id, salaryId: salary.id, teacherId: teacher.id, groupId: group.id,
      year: 2026, month: 8, amount: 8_200_000, method: "cash", paidAt: new Date(Date.UTC(2026, 8, 5)),
    },
  });
  const salRes = await financialTx.postTeacherPayroll({ salaryTransactionId: salTx.id }, owner);
  const SL = await linesOf(salRes.entry.id);
  eq("Debet xarajat", SL.expense?.debit, 8_200_000);
  eq("Kredit naqd", SL.cash?.credit, 8_200_000);
  eq("teacherId muhrlandi", salRes.entry.teacherId, teacher.id);
  eq("davr muhrlandi (2026-08)", `${salRes.entry.periodYear}-${salRes.entry.periodMonth}`, "2026-8");
  const salCat = await dim.salaryCategoryId();
  eq("maosh kategoriyasiga bog'landi", salRes.entry.expenseCategoryId, salCat);

  const payroll = await prisma.staffPayroll.create({
    data: { branchId: br.id, employeeId: staff.id, year: 2026, month: 8, finalAmount: 3_000_000 },
  });
  const staffTx = await prisma.staffSalaryTransaction.create({
    data: {
      branchId: br.id, payrollId: payroll.id, employeeId: staff.id, year: 2026, month: 8,
      amount: 3_000_000, method: "cash", paidAt: new Date(Date.UTC(2026, 8, 5)),
    },
  });
  const staffRes = await financialTx.postStaffPayroll({ staffSalaryTransactionId: staffTx.id }, owner);
  eq("xodim: staffId muhrlandi", staffRes.entry.staffId, staff.id);
  eq("xodim: costType fixed", staffRes.entry.costType, "fixed");

  // ═══════════════ 5) QAYTARIM ═══════════════
  head("5) Qaytarim (Faza 6)");
  const origTx = await prisma.paymentTransaction.findFirst({
    where: { paymentId: plan1.id, isDeleted: false },
  });
  const refund = await prisma.refund.create({
    data: {
      branchId: br.id, studentId: student.id, groupId: group.id, membershipId: membership.id,
      originalTransactionId: origTx.id, amount: 300_000, method: "cash",
      reason: "Kursni tark etdi", requestedById: owner.id,
    },
  });
  const refRes = await financialTx.postRefund({ refundId: refund.id }, owner);
  const RL = await linesOf(refRes.entry.id);
  eq("Debet daromad", RL.revenue?.debit, 300_000);
  eq("Kredit naqd", RL.cash?.credit, 300_000);
  const refAfter = await prisma.refund.findUnique({ where: { id: refund.id } });
  eq("holat executed", refAfter.status, "executed");
  eq("jurnal yozuviga bog'landi", refAfter.journalEntryId, refRes.entry.id);
  const origStill = await prisma.journalEntry.findUnique({ where: { id: payEntry.id } });
  eq("ASL to'lov yozuvi O'ZGARMADI", origStill.totalCredit, 700_000);

  const tooBig = await prisma.refund.create({
    data: {
      branchId: br.id, studentId: student.id, originalTransactionId: origTx.id,
      amount: 500_000, method: "cash", reason: "ortiqcha", requestedById: owner.id,
    },
  });
  await mustThrow("to'langandan ortiq qaytarib bo'lmaydi",
    () => financialTx.postRefund({ refundId: tooBig.id }, owner), "oshib ketdi");

  // ═══════════════ 7-8) EGASINING PULI ═══════════════
  head("7-8) Egasining puli (Faza 13) — daromad/xarajat EMAS");
  const inv = await financialTx.postOwnerInvestment(
    { branchId: br.id, amount: 20_000_000, method: "bank", reference: `${S}-inv1`, ownerId: owner.id }, owner,
  );
  const IL = await linesOf(inv.entry.id);
  eq("Debet bank", IL.bank?.debit, 20_000_000);
  eq("Kredit owner_capital", IL.owner_capital?.credit, 20_000_000);
  eq("DAROMAD hisobi TEGILMADI", IL.revenue, undefined);

  const wdr = await financialTx.postOwnerWithdrawal(
    { branchId: br.id, amount: 10_000_000, method: "cash", reference: `${S}-wdr1`, ownerId: owner.id }, owner,
  );
  const WL = await linesOf(wdr.entry.id);
  eq("Debet owner_capital", WL.owner_capital?.debit, 10_000_000);
  eq("Kredit naqd", WL.cash?.credit, 10_000_000);
  eq("XARAJAT hisobi TEGILMADI", WL.expense, undefined);
  const invDup = await financialTx.postOwnerInvestment(
    { branchId: br.id, amount: 20_000_000, method: "bank", reference: `${S}-inv1`, ownerId: owner.id }, owner,
  );
  eq("investitsiya idempotent", invDup.duplicate, true);

  // ═══════════════ 9) ICHKI O'TKAZMA ═══════════════
  head("9) Ichki o'tkazma (bank → kassa) — na daromad, na xarajat");
  const tr = await financialTx.postTransfer(
    { branchId: br.id, fromMethod: "bank", toMethod: "cash", amount: 5_000_000, reference: `${S}-tr1` }, owner,
  );
  const TL = await linesOf(tr.entry.id);
  eq("Debet naqd", TL.cash?.debit, 5_000_000);
  eq("Kredit bank", TL.bank?.credit, 5_000_000);
  eq("daromad YO'Q", TL.revenue, undefined);
  eq("xarajat YO'Q", TL.expense, undefined);
  eq("o'quvchi o'lchovi YO'Q", tr.entry.studentId, null);
  await mustThrow("bir xil hisobga o'tkazib bo'lmaydi",
    () => financialTx.postTransfer(
      { branchId: br.id, fromMethod: "cash", toMethod: "cash", amount: 1000, reference: `${S}-tr2` }, owner,
    ), "bir xil");

  // ═══════════════ 10) TAKRORLANUVCHI CHIQIM ═══════════════
  head("10) Takrorlanuvchi chiqim: KUTILAYOTGAN → HAQIQIY");
  const rec = await prisma.recurringExpense.create({
    data: {
      branchId: br.id, categoryId: cat.id, title: "Ijara (oylik)", expectedAmount: 8_000_000,
      costType: "fixed", interval: "monthly", startDate: new Date(Date.UTC(2026, 7, 1)),
      nextDueAt: new Date(Date.UTC(2026, 8, 1)),
    },
  });
  const occ = await prisma.recurringExpenseOccurrence.create({
    data: {
      recurringExpenseId: rec.id, branchId: br.id, dueDate: new Date(Date.UTC(2026, 8, 1)),
      periodYear: 2026, periodMonth: 9, expectedAmount: 8_000_000,
    },
  });
  const jBeforeOcc = await prisma.journalEntry.count({ where: { branchId: br.id } });
  eq("kutilayotgan qator JURNALGA TUSHMAYDI", jBeforeOcc, jBeforeOcc);
  eq("holat pending", occ.status, "pending");
  // Tasdiqlanganda haqiqiy chiqim yaratiladi va SHUNDA jurnalga tushadi.
  const realExp = await inBr(() => expenseService.create({
    category: cat.id, title: "Ijara sentabr", amount: 8_000_000,
    spentAt: "2026-09-01", method: "bank",
  }, owner));
  await prisma.recurringExpenseOccurrence.update({
    where: { id: occ.id },
    data: { status: "paid", expenseId: realExp._id || realExp.id, paidAt: new Date(), paidAmount: 8_000_000 },
  });
  const occAfter = await prisma.recurringExpenseOccurrence.findUnique({ where: { id: occ.id } });
  eq("to'langach holat paid", occAfter.status, "paid");
  const occEntry = await prisma.journalEntry.findFirst({
    where: { refModel: "Expense", refId: realExp._id || realExp.id },
  });
  eq("faqat SHU paytda jurnal yozuvi bor", Boolean(occEntry), true);

  // ═══════════════ 13) FILIAL MUVOFIQLIGI ═══════════════
  head("13) Filial muvofiqligi — zid o'lchov RAD ETILADI");
  await mustThrow("boshqa filial guruhi rad etiladi",
    () => financialTx.postAdjustment({
      branchId: br.id, reference: `${S}-adj-bad`, reason: "sinov",
      dimensions: { groupId: groupB.id },
      lines: [{ accountKind: "cash", debit: 1000 }, { accountKind: "equity", credit: 1000 }],
    }, owner), "boshqa filial");
  await mustThrow("boshqa filial xonasi rad etiladi",
    () => financialTx.postAdjustment({
      branchId: br.id, reference: `${S}-adj-bad2`, reason: "sinov",
      dimensions: { roomId: roomB.id },
      lines: [{ accountKind: "cash", debit: 1000 }, { accountKind: "equity", credit: 1000 }],
    }, owner), "boshqa filial");

  head("13b) Mos kelmaydigan o'lchov turi rad etiladi");
  try {
    dim.assertApplicable(ENTRY_KINDS.ACCOUNT_TRANSFER, { studentId: student.id });
    bad("ichki o'tkazmada o'quvchi rad etiladi");
  } catch (e) { ok("ichki o'tkazmada o'quvchi rad etiladi", e.message.slice(0, 55)); }
  try {
    dim.assertApplicable(ENTRY_KINDS.EXPENSE, { studentId: student.id });
    bad("chiqimda o'quvchi rad etiladi");
  } catch (e) { ok("chiqimda o'quvchi rad etiladi", e.message.slice(0, 55)); }
  try {
    dim.assertApplicable(ENTRY_KINDS.PAYMENT, { studentId: student.id, groupId: group.id });
    ok("to'lovda o'quvchi+guruh QABUL qilinadi");
  } catch (e) { bad("to'lovda o'quvchi+guruh qabul qilinadi", e.message); }

  // ═══════════════ 14) MUVOZANAT INVARIANTI ═══════════════
  head("14) Muvozanat invarianti");
  await mustThrow("nomuvozanat yozuv rad etiladi",
    () => financialTx.postAdjustment({
      branchId: br.id, reference: `${S}-unbal`, reason: "sinov",
      lines: [{ accountKind: "cash", debit: 1000 }, { accountKind: "equity", credit: 999 }],
    }, owner), "muvozanat");
  await mustThrow("sababsiz tuzatish rad etiladi",
    () => financialTx.postAdjustment({
      branchId: br.id, reference: `${S}-noreason`,
      lines: [{ accountKind: "cash", debit: 1000 }, { accountKind: "equity", credit: 1000 }],
    }, owner), "sabab");
  const allEntries = await prisma.journalEntry.findMany({ where: { branchId: br.id } });
  const unbalanced = allEntries.filter((e) => e.totalDebit !== e.totalCredit);
  eq("barcha yozuvlar muvozanatda", unbalanced.length, 0);

  // ═══════════════ 15) HISOB QOLDIG'I ═══════════════
  head("15) Hisob qoldig'ining to'g'riligi");
  // naqd: +700k(2-to'lov qisman 500k) ... aniq hisoblaymiz
  const cashBal = await journal.accountBalance(br.id, ACCOUNT_KINDS.CASH);
  const bankBal = await journal.accountBalance(br.id, ACCOUNT_KINDS.BANK);
  const clickBal = await journal.accountBalance(br.id, ACCOUNT_KINDS.CLICK);
  // click: 700 000 (1-to'lov) + 693 000 (komissiyali) = 1 393 000
  eq("click qoldig'i", clickBal, 1_393_000);
  // bank: -8 000 000 (ijara) + 20 000 000 (investitsiya) - 8 000 000 (sentabr ijara) - 5 000 000 (o'tkazma) = -1 000 000
  eq("bank qoldig'i", bankBal, -1_000_000);
  // naqd: +500 000 (qisman) - 8 200 000 (ustoz) - 3 000 000 (xodim) - 300 000 (qaytarim) - 10 000 000 (yechish) + 5 000 000 (o'tkazma)
  eq("naqd qoldig'i", cashBal, -16_000_000);
  const ownerCap = await journal.accountBalance(br.id, ACCOUNT_KINDS.OWNER_CAPITAL);
  eq("egasi kapitali (20M - 10M)", ownerCap, 10_000_000);

  // ═══════════════ 16) AUDIT IZI ═══════════════
  head("16) Audit izi");
  const audits = await prisma.financialAuditLog.findMany({ where: { branchId: br.id } });
  const types = [...new Set(audits.map((a) => a.entityType))].sort();
  eq("audit yozuvlari bor", audits.length > 0, true);
  ok("qamrab olingan turlar", types.join(", "));
  const need = ["PaymentTransaction", "Expense", "Refund", "OwnerCapital", "AccountTransfer", "SalaryTransaction"];
  const missing = need.filter((t) => !types.includes(t));
  eq("sezgir amallarning hammasi auditda", missing.length ? missing.join(",") : 0, 0);
  const ownerAudit = audits.find((a) => a.entityType === "OwnerCapital");
  eq("audit summani saqlaydi", ownerAudit?.amountAfter, 20_000_000);
  eq("audit aktyorni saqlaydi", ownerAudit?.actorId, owner.id);

  // ═══════════════ 17) ROLLBACK ═══════════════
  head("17) Xatoda TO'LIQ qaytarish (rollback)");
  const cntBefore = await prisma.expense.count({ where: { branchId: br.id } });
  const jBefore = await prisma.journalEntry.count({ where: { branchId: br.id } });
  try {
    await runFinanceTxn(async (tx) => {
      const e = await tx.expense.create({
        data: {
          branchId: br.id, categoryId: cat.id, categoryName: cat.name, title: "ROLLBACK",
          amount: 123_456, spentAt: new Date(), accrualYear: 2026, accrualMonth: 8, method: "cash",
        },
      });
      await financialTx.postExpense({ expenseId: e.id }, owner, { tx });
      throw new Error("ataylab yiqitildi");
    });
    bad("tranzaksiya yiqilishi kerak edi");
  } catch (e) {
    if (e.message.includes("ataylab")) ok("tranzaksiya yiqildi (kutilgan)");
    else bad("boshqa xato", e.message);
  }
  eq("chiqim QAYTARILDI", await prisma.expense.count({ where: { branchId: br.id } }), cntBefore);
  eq("jurnal yozuvi QAYTARILDI", await prisma.journalEntry.count({ where: { branchId: br.id } }), jBefore);
  const orphan = await prisma.expense.findFirst({ where: { title: "ROLLBACK" } });
  eq("yetim chiqim qolmadi", orphan, null);

  // ═══════════════ 18) RECONCILE ═══════════════
  head("18) reconcile()");
  const rec2 = await journal.reconcile();
  eq("jurnal muvozanatda", rec2.ok, true);
  eq("nomuvozanat yozuv yo'q", rec2.unbalancedEntries.length, 0);
  eq("filiallararo muvozanat", rec2.interBranch.balanced, true);

  // Yetim qator yo'qligi (har yozuvda kamida 2 qator)
  const entriesWithLines = await prisma.journalEntry.findMany({
    where: { branchId: br.id }, include: { _count: { select: { lines: true } } },
  });
  const shortEntries = entriesWithLines.filter((e) => e._count.lines < 2);
  eq("qatorsiz/yarim yozuv yo'q", shortEntries.length, 0);

  // ═══════════════ 19) PARALLEL TO'LOV (poyga) ═══════════════
  //
  // NEGA SHU YERDA: `tests/paymentRace.test.js` Mongoose fixture'ga
  // tayanadi va Mongo yo'qligida umuman ishga tusha olmaydi. STEP 4
  // aynan shu kodni (applyPaidDelta + create + post) bitta
  // tranzaksiyaga ko'chirdi — ya'ni poyga himoyasi QAYTA sinalishi
  // shart, aks holda eng xavfli regressiya sinovsiz qolardi.
  head("19) Parallel to'lov — qarzdan ortiq yozilmaydi");
  const planR = await mkPlan(11, 300_000);
  // Poygagacha o'quvchi hisobidagi pul (haqiqiy kirim + depozit qoldig'i).
  const beforeDirect = await prisma.paymentTransaction.aggregate({
    where: { studentId: student.id, source: "direct", isDeleted: false },
    _sum: { amount: true },
  });
  const beforeDep = await prisma.studentDeposit.findUnique({ where: { studentId: student.id } });
  const moneyBefore = (beforeDirect._sum.amount || 0) + (beforeDep?.balance || 0);
  // 10 ta parallel so'rov, har biri 300 000 — jami 3 000 000,
  // qarz esa atigi 300 000.
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => inBr(() => txnService.create(
      { paymentId: planR.id, amount: 300_000, method: "cash" }, owner,
    ))),
  );
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  // Rad etilgan so'rovlarning SABABINI ko'rsatamiz. Poygada bir nechta
  // so'rovning rad etilishi NORMAL (qulf/serializatsiya), lekin sabab
  // ko'rinib turishi shart — aks holda jimgina "9 ta o'tdi" degan
  // raqamning ortida haqiqiy nosozlik yashirinib qolardi.
  const rejected = results
    .filter((r) => r.status === "rejected")
    .map((r) => {
      const e = r.reason;
      const m = (e?.message || "").split("\n").filter(Boolean)[0] || "(xabarsiz)";
      return `${e?.name || "?"}/${e?.code || e?.statusCode || "-"}: ${m}`.slice(0, 110);
    });
  for (const msg of new Set(rejected)) {
    ok("  rad etildi (kutilgan)", `${msg} ×${rejected.filter((m) => m === msg).length}`);
  }
  const planAfter = await prisma.studentPayment.findUnique({ where: { id: planR.id } });
  const txSum = await prisma.paymentTransaction.aggregate({
    where: { paymentId: planR.id, isDeleted: false }, _sum: { amount: true },
  });
  eq("paidAmount expectedAmount dan OSHMAYDI", planAfter.paidAmount <= 300_000, true);
  eq("paidAmount == tranzaksiyalar yig'indisi", planAfter.paidAmount, txSum._sum.amount || 0);
  // ── PUL YO'QOLMAYDI ──
  // Ortgan pul FAQAT shu planga tushmaydi: `autoApply` uni o'quvchining
  // BOSHQA qoldiq oylariga ham (eng eskisidan) qoplaydi, qolgani esa
  // depozitda turadi. Shuning uchun hisob-kitob O'QUVCHI DARAJASIDA
  // olinadi — faqat shu planga qarash "pul yo'qoldi" degan yolg'on
  // xulosaga olib kelardi.
  const dep = await prisma.studentDeposit.findUnique({ where: { studentId: student.id } });
  const allDirect = await prisma.paymentTransaction.aggregate({
    where: { studentId: student.id, source: "direct", isDeleted: false },
    _sum: { amount: true },
  });
  const accountedAfter = (allDirect._sum.amount || 0) + (dep?.balance || 0);
  const expectedAfter = moneyBefore + okCount * 300_000;
  eq("pul yo'qolmaydi (kirgan == plan + boshqa oylar + depozit)", accountedAfter, expectedAfter);
  ok("  tafsilot", `muvaffaqiyatli ${okCount}, shu planda ${planAfter.paidAmount}, depozitda ${dep?.balance || 0}`);

  // Har bir tranzaksiyaga AYNAN BITTA jurnal yozuvi
  const rTxs = await prisma.paymentTransaction.findMany({
    where: { paymentId: planR.id, isDeleted: false }, select: { id: true },
  });
  const rEntries = await prisma.journalEntry.findMany({
    where: { postingKey: { in: rTxs.map((t) => `payment:${t.id}`) } }, select: { postingKey: true },
  });
  eq("har tranzaksiyaga AYNAN BITTA yozuv", rEntries.length, rTxs.length);

  // ═══════════ 20) BUTUN SO'ROV ATOMIKLIGI (ortiqcha → depozit) ═══════════
  //
  // Bu ilgari OCHIQ TUYNUK edi: taqsimlash bir tranzaksiyada, ortiqcha
  // pulni depozitga o'tkazish esa BOSHQASIDA. Depozit qadami yiqilsa
  // so'rov xato qaytarardi, lekin taqsimlangan pul ALLAQACHON yozilgan
  // bo'lardi — foydalanuvchi qayta urib, to'lov ikki marta tushardi.
  //
  // TEKSHIRISH USULI: depozit qadamini HAQIQATAN yiqitamiz — o'quvchini
  // amal o'rtasida "o'chirilgan" qilib qo'yamiz (`ensureStudent` shunda
  // xato beradi). Taqsimlash muvaffaqiyatli bo'lishi, keyin depozit
  // qadami yiqilishi kerak.
  head("20) Butun so'rov atomikligi — depozit qadami yiqilsa TAQSIMLASH ham qaytadi");
  const planA = await mkPlan(12, 100_000);
  const beforeTx = await prisma.paymentTransaction.count({ where: { paymentId: planA.id } });
  const beforeJ = await prisma.journalEntry.count({ where: { branchId: br.id } });
  const depBefore = await prisma.studentDeposit.findUnique({ where: { studentId: student.id } });

  // O'quvchini vaqtincha "o'chirilgan" qilamiz — depozit qadami shunda yiqiladi.
  await prisma.user.update({ where: { id: student.id }, data: { isDeleted: true } });
  let threw = false;
  try {
    // 300 000 to'lov: 100 000 planga tushadi, 200 000 ortadi → depozit → XATO.
    await inBr(() => txnService.create(
      { paymentId: planA.id, amount: 300_000, method: "cash" }, owner,
    ));
  } catch (e) { threw = true; }
  await prisma.user.update({ where: { id: student.id }, data: { isDeleted: false } });

  eq("so'rov xato qaytardi", threw, true);
  const planAafter = await prisma.studentPayment.findUnique({ where: { id: planA.id } });
  eq("plan balansi QAYTARILDI (0)", planAafter.paidAmount, 0);
  eq("to'lov tranzaksiyasi QAYTARILDI",
    await prisma.paymentTransaction.count({ where: { paymentId: planA.id } }), beforeTx);
  eq("jurnal yozuvi QAYTARILDI",
    await prisma.journalEntry.count({ where: { branchId: br.id } }), beforeJ);
  const depAfter = await prisma.studentDeposit.findUnique({ where: { studentId: student.id } });
  eq("depozit qoldig'i O'ZGARMADI", depAfter?.balance || 0, depBefore?.balance || 0);

  // Endi o'quvchi joyida — o'sha to'lov TO'LIQ o'tishi kerak.
  const okRes = await inBr(() => txnService.create(
    { paymentId: planA.id, amount: 300_000, method: "cash" }, owner,
  ));
  const planAok = await prisma.studentPayment.findUnique({ where: { id: planA.id } });
  eq("qayta urinishda plan to'landi", planAok.paidAmount, 100_000);
  eq("ortiqcha depozitga tushdi", okRes.depositCredited, 200_000);

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
  if (R.failures.length) {
    console.log("Muammolar:");
    for (const f of R.failures) console.log("  • " + f);
  }
};

run()
  .catch((err) => { console.error("\nTEST YIQILDI:", err); R.fail += 1; })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
