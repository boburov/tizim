/**
 * MOLIYA TAHLILI (STEP 5) — PostgreSQL (Prisma) USTIDA.
 *
 * ══════════════════════════════════════════════════════════════════════
 * SENARIY — HAR RAQAM QO'LDA HISOBLANGAN
 * ══════════════════════════════════════════════════════════════════════
 * Tasodifiy "ishlab chiqarishga o'xshash" sonlar ATAYLAB ishlatilmaydi:
 * kutilgan natija qayerdan kelganini o'qib tushunish mumkin bo'lishi
 * kerak, aks holda test yiqilganda kod xatosimi yoki test xatosimi —
 * bilib bo'lmaydi.
 *
 * FILIAL A                             DAVR: joriy oy (M)
 *   Kurslar : IELTS, General
 *   Xonalar : R1, R2
 *   Guruhlar: G1 (IELTS, R1, ustoz T1)
 *             G2 (General, R2, ustoz T1)
 *             G3 (IELTS, R1, ustoz T2 VA T3 → ATRIBUTSIYA NOANIQ)
 *
 *   OYLIK PLANLAR (M)                asl narx  chegirma  kutilgan
 *     S1/G1                           800 000   100 000   700 000
 *     S2/G1                           700 000         0   700 000
 *     S3/G2                           500 000         0   500 000
 *     S4/G3                           600 000         0   600 000
 *     S5/G3                           400 000         0   400 000
 *                                                        ─────────
 *                                          JAMI KUTILGAN 2 900 000
 *
 *   TO'LOVLAR (M)
 *     S1  700 000  click                       → to'liq
 *     S2  400 000  cash                        → qisman (qoldiq 300 000)
 *     S3  500 000  payme, komissiya 5 000      → netto 495 000
 *     S5  400 000  cash                        → to'liq (G3 → NOANIQ)
 *     S4        0                              → qoldiq 600 000
 *                                    JAMI UNDIRILGAN 2 000 000
 *                                    QOLDIQ            900 000
 *
 *   QAYTARIM: S1 ga 100 000 (naqd)  → brutto 2 000 000, netto 1 900 000
 *
 *   CHIQIM:  Ijara     800 000 (bank, DOIMIY)
 *            Marketing 200 000 (naqd, O'ZGARUVCHAN)
 *   MAOSH:   T1        300 000 (naqd, G1 uchun)
 *
 *   EGASI:   +5 000 000 (bank), −1 000 000 (naqd)
 *   ICHKI:   bank → naqd 500 000
 *
 *   ESKI QARZ (yosh tahlili uchun):
 *     S4/G3  M−4  600 000 to'lanmagan   → 60+ kun
 *     S4/G3  M−1  600 000 to'lanmagan   → 60 kundan KAM
 *
 * ISHLATISH:  npm run test:fin-analytics
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as financialTx from "../src/modules/finance/services/financialTransaction.service.js";
import * as dim from "../src/modules/finance/services/dimensionResolver.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";

import * as summarySvc from "../src/modules/financeAnalytics/services/summary.service.js";
import * as revenueSvc from "../src/modules/financeAnalytics/services/revenue.service.js";
import * as expenseSvc from "../src/modules/financeAnalytics/services/expense.service.js";
import * as cashSvc from "../src/modules/financeAnalytics/services/cashFlow.service.js";
import * as recvSvc from "../src/modules/financeAnalytics/services/receivables.service.js";
import * as profitSvc from "../src/modules/financeAnalytics/services/profitability.service.js";
import * as discountSvc from "../src/modules/financeAnalytics/services/discount.service.js";
import * as alertSvc from "../src/modules/financeAnalytics/services/alerts.service.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));
const near = (n, a, b, tol = 0.05) =>
  (a !== null && Math.abs(a - b) <= tol ? ok(n, String(a)) : bad(n, `kutilgan ~${b}, keldi ${a}`));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const M = (v) => new Intl.NumberFormat("uz-UZ").format(v);

const S = `an${Date.now().toString(36)}`;
const made = { users: [], branches: [], groups: [], courses: [], rooms: [], cats: [], budgets: [] };

// ── Davr: joriy oy (test vaqt o'tishi bilan ham barqaror qolsin) ──
const NOW = new Date();
const Y = NOW.getUTCFullYear();
const MO = NOW.getUTCMonth() + 1;
const monthStart = (back = 0) => new Date(Date.UTC(Y, MO - 1 - back, 1));
const midMonth = (back = 0) => new Date(Date.UTC(Y, MO - 1 - back, 2, 12));
const ym = (back = 0) => { const d = monthStart(back); return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }; };

const cleanup = async () => {
  const b = made.branches;
  if (b.length) {
    const es = await prisma.journalEntry.findMany({ where: { branchId: { in: b } }, select: { id: true } });
    const ids = es.map((e) => e.id);
    if (ids.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: b } } });
    await prisma.refund.deleteMany({ where: { branchId: { in: b } } });
    await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: b } } });
    await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: b } } });
    await prisma.studentPayment.deleteMany({ where: { branchId: { in: b } } });
    await prisma.expense.deleteMany({ where: { branchId: { in: b } } });
    await prisma.depositTransaction.deleteMany({ where: { branchId: { in: b } } });
  }
  if (made.budgets.length) {
    await prisma.budgetLine.deleteMany({ where: { budgetId: { in: made.budgets } } });
    await prisma.budget.deleteMany({ where: { id: { in: made.budgets } } });
  }
  if (made.users.length) {
    await prisma.studentDeposit.deleteMany({ where: { studentId: { in: made.users } } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { teacherId: { in: made.users } } });
  }
  if (made.groups.length) {
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: made.groups } } });
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
    data: { firstName: name, lastName: "T", username: `${name.toLowerCase()}_${S}`,
      passwordHash: "x", role, homeBranchId: branchId, hiredAt: new Date(Date.UTC(2024, 0, 1)) },
  });
  made.users.push(u.id); return u;
};

const run = async () => {
  console.log("\n=== MOLIYA TAHLILI / STEP 5 ===\n");
  await prisma.$queryRaw`SELECT 1`;
  dim.resetCaches();

  // ─────────────── SENARIYNI QURAMIZ ───────────────
  const br = await prisma.branch.create({ data: { name: `AN ${S}` } });
  const brB = await prisma.branch.create({ data: { name: `AN B ${S}` } });
  made.branches.push(br.id, brB.id);

  const owner = await mkUser("Ega", "owner", br.id);
  const T1 = await mkUser("Ustoz1", "teacher", br.id);
  const T2 = await mkUser("Ustoz2", "teacher", br.id);
  const T3 = await mkUser("Ustoz3", "teacher", br.id);
  const students = [];
  for (let i = 1; i <= 5; i += 1) students.push(await mkUser(`Talaba${i}`, "student", br.id));
  const [S1, S2, S3, S4, S5] = students;

  const ielts = await prisma.course.create({ data: { title: `IELTS ${S}`, code: `ie_${S}` } });
  const general = await prisma.course.create({ data: { title: `General ${S}`, code: `ge_${S}` } });
  made.courses.push(ielts.id, general.id);
  const R1 = await prisma.room.create({ data: { branchId: br.id, name: `R1-${S}` } });
  const R2 = await prisma.room.create({ data: { branchId: br.id, name: `R2-${S}` } });
  made.rooms.push(R1.id, R2.id);

  const mkGroup = async (name, courseId, roomId) => {
    const g = await prisma.group.create({ data: { branchId: br.id, name: `${name}-${S}`, courseId, roomId, isActive: true } });
    made.groups.push(g.id);
    // Haftada 4 soat: 2 kun × 2 soat (xona bandligi uchun)
    await prisma.groupScheduleItem.createMany({ data: [
      { groupId: g.id, day: "mon", startTime: "09:00", endTime: "11:00" },
      { groupId: g.id, day: "wed", startTime: "09:00", endTime: "11:00" },
    ] });
    return g;
  };
  const G1 = await mkGroup("G1", ielts.id, R1.id);
  const G2 = await mkGroup("G2", general.id, R2.id);
  const G3 = await mkGroup("G3", ielts.id, R1.id);

  const start = new Date(Date.UTC(Y - 1, 0, 1));
  // G1, G2 → BITTA ustoz (atributsiya ANIQ). G3 → IKKITA (NOANIQ).
  await prisma.teacherGroupPeriod.createMany({ data: [
    { teacherId: T1.id, groupId: G1.id, startDate: start },
    { teacherId: T1.id, groupId: G2.id, startDate: start },
    { teacherId: T2.id, groupId: G3.id, startDate: start },
    { teacherId: T3.id, groupId: G3.id, startDate: start },
  ] });

  const memberOf = async (student, group) => prisma.groupMembership.create({
    data: { groupId: group.id, studentId: student.id, joinedAt: monthStart(6) },
  });
  await memberOf(S1, G1); await memberOf(S2, G1); await memberOf(S3, G2);
  await memberOf(S4, G3); await memberOf(S5, G3);

  const cur = ym(0);
  const mkPlan = async (student, group, baseFee, discount, back = 0) => {
    const p = ym(back);
    return prisma.studentPayment.create({ data: {
      branchId: br.id, studentId: student.id, groupId: group.id,
      year: p.year, month: p.month, baseFee,
      discountApplied: discount, expectedAmount: baseFee - discount, paidAmount: 0,
    } });
  };
  const p1 = await mkPlan(S1, G1, 800_000, 100_000);
  const p2 = await mkPlan(S2, G1, 700_000, 0);
  const p3 = await mkPlan(S3, G2, 500_000, 0);
  await mkPlan(S4, G3, 600_000, 0);
  const p5 = await mkPlan(S5, G3, 400_000, 0);
  // Eski qarzlar — yosh tahlili uchun
  await mkPlan(S4, G3, 600_000, 0, 4);
  await mkPlan(S4, G3, 600_000, 0, 1);

  const scope = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: false, userId: owner.id };
  const inBr = (fn) => runWithBranchContext(scope, fn);

  // TO'LOVLAR — markaziy servis orqali (haqiqiy yo'l)
  const pay = async (plan, amount, method, fee = 0) => {
    const trx = await prisma.paymentTransaction.create({ data: {
      branchId: br.id, paymentId: plan.id, studentId: plan.studentId, groupId: plan.groupId,
      year: plan.year, month: plan.month, amount, feeAmount: fee,
      source: "direct", method, paidAt: midMonth(0),
    } });
    await prisma.studentPayment.update({ where: { id: plan.id }, data: { paidAmount: { increment: amount } } });
    await financialTx.postStudentPayment({ paymentTransactionId: trx.id }, owner);
    return trx;
  };
  const t1 = await pay(p1, 700_000, "click");
  await pay(p2, 400_000, "cash");
  await pay(p3, 500_000, "payme", 5_000);
  await pay(p5, 400_000, "cash");

  // QAYTARIM
  const refund = await prisma.refund.create({ data: {
    branchId: br.id, studentId: S1.id, groupId: G1.id, originalTransactionId: t1.id,
    amount: 100_000, method: "cash", reason: "test", requestedById: owner.id,
  } });
  await financialTx.postRefund({ refundId: refund.id }, owner);

  // CHIQIMLAR
  const catRent = await prisma.expenseCategory.create({
    data: { name: `Ijara ${S}`, code: `rent_${S}`, kind: "operating", costType: "fixed" } });
  const catMkt = await prisma.expenseCategory.create({
    data: { name: `Marketing ${S}`, code: `mkt_${S}`, kind: "operating", costType: "variable" } });
  made.cats.push(catRent.id, catMkt.id);

  const mkExpense = async (cat, title, amount, method, back = 0) => {
    const p = ym(back);
    const e = await prisma.expense.create({ data: {
      branchId: br.id, categoryId: cat.id, categoryName: cat.name, categoryKind: cat.kind,
      title, amount, spentAt: midMonth(back), accrualYear: p.year, accrualMonth: p.month, method,
    } });
    await financialTx.postExpense({ expenseId: e.id }, owner);
    return e;
  };
  await mkExpense(catRent, "Ijara", 800_000, "bank");
  await mkExpense(catMkt, "Reklama", 200_000, "cash");
  // Oldingi davr uchun marketing (o'sish ogohlantirishini tekshirish uchun)
  await mkExpense(catMkt, "Reklama (oldingi)", 100_000, "cash", 1);

  // MAOSH
  const sal = await prisma.teacherSalary.create({ data: {
    branchId: br.id, teacherId: T1.id, groupId: G1.id, year: cur.year, month: cur.month,
    expectedAmount: 300_000, paidAmount: 0 } });
  const salTx = await prisma.salaryTransaction.create({ data: {
    branchId: br.id, salaryId: sal.id, teacherId: T1.id, groupId: G1.id,
    year: cur.year, month: cur.month, amount: 300_000, method: "cash", paidAt: midMonth(0) } });
  await financialTx.postTeacherPayroll({ salaryTransactionId: salTx.id }, owner);

  // EGASI VA ICHKI O'TKAZMA
  await financialTx.postOwnerInvestment(
    { branchId: br.id, amount: 5_000_000, method: "bank", reference: `${S}-inv`, date: midMonth(0), ownerId: owner.id }, owner);
  await financialTx.postOwnerWithdrawal(
    { branchId: br.id, amount: 1_000_000, method: "cash", reference: `${S}-wdr`, date: midMonth(0), ownerId: owner.id }, owner);
  await financialTx.postTransfer(
    { branchId: br.id, fromMethod: "bank", toMethod: "cash", amount: 500_000, reference: `${S}-tr`, date: midMonth(0) }, owner);

  // BYUDJET
  const budget = await prisma.budget.create({ data: {
    name: `B-${S}`, branchId: br.id, periodType: "month", year: cur.year, month: cur.month, status: "active",
    lines: { create: [
      { scope: "total", amount: 2_000_000 },
      { scope: "category", categoryId: catRent.id, amount: 500_000 },
      { scope: "category", categoryId: catMkt.id, amount: 300_000 },
    ] } } });
  made.budgets.push(budget.id);

  const F = { year: cur.year, month: cur.month };

  // ══════════════ 1) XULOSA ══════════════
  head("1) Moliyaviy xulosa");
  const sum = await inBr(() => summarySvc.getSummary(F));
  eq("brutto daromad", sum.revenueGross.current, 2_000_000);
  eq("qaytarim", sum.refunds.current, 100_000);
  eq("netto daromad", sum.revenue.current, 1_900_000);
  eq("maosh", sum.payroll.current, 300_000);
  eq("komissiya", sum.fees.current, 5_000);
  eq("operatsion xarajat (1.3M + 5k)", sum.operatingExpenses.current, 1_305_000);
  eq("to'g'ridan-to'g'ri xarajat (maosh+komissiya)", sum.directCosts.current, 305_000);
  eq("HISSA FOYDASI (1.9M − 305k)", sum.contributionProfit.current, 1_595_000);
  eq("operatsion natija (1.9M − 1.3M − 5k)", sum.operatingResult.current, 595_000);
  near("hissa marjasi %", sum.contributionMargin.current, 83.95, 0.02);

  // ══════════════ 2) PUL QOLDIG'I ≠ FOYDA ══════════════
  head("2) Pul qoldig'i (FOYDADAN boshqa narsa)");
  // click 700 000 + payme 495 000 + naqd (−300 000) + bank 3 700 000 = 4 595 000
  // MINUS oldingi oydagi marketing 100 000 (u ham naqddan chiqqan) = 4 495 000
  //
  // DIQQAT: `cashBalance` DAVR BOSHIDAN emas, BUTUN TARIXDAN hisoblanadi —
  // "hozir kassada qancha pul bor" degan savolning javobi shu. Shuning
  // uchun oldingi oydagi chiqim ham unga kiradi.
  eq("kassa qoldig'i", sum.cashBalance, 4_495_000);
  ok("foyda ≠ qoldiq", `foyda ${M(sum.contributionProfit.current)} vs qoldiq ${M(sum.cashBalance)}`);

  // ══════════════ 3) EGASI VA ICHKI O'TKAZMA CHETLASHTIRILDI ══════════════
  head("3) Egasining puli va ichki o'tkazma daromadga KIRMAYDI");
  eq("egasi 5M daromadga qo'shilmadi", sum.revenueGross.current, 2_000_000);
  eq("egasi yechishi xarajatga qo'shilmadi", sum.operatingExpenses.current, 1_305_000);
  const cf = await inBr(() => cashSvc.getCashFlow(F));
  eq("moliyalashtirish kirim", cf.financing.inflow, 5_000_000);
  eq("moliyalashtirish chiqim", cf.financing.outflow, 1_000_000);
  eq("ichki o'tkazma NETTOSI nol", cf.internal.net, 0);
  eq("operatsion sof oqim", cf.operating.net, 595_000);
  // Ochilish = oldingi oydagi marketing chiqimi (−100 000).
  eq("ochilish qoldig'i (oldingi oy marketingi)", cf.openingBalance, -100_000);
  // −100 000 + 595 000 (operatsion) + 4 000 000 (moliyalashtirish) + 0 (ichki)
  eq("yopilish qoldig'i", cf.closingBalance, 4_495_000);
  eq("yopilish = ochilish + oqimlar", cf.openingBalance + cf.operating.net
    + cf.financing.net + cf.internal.net, cf.closingBalance);
  eq("yopilish == kassa qoldig'i", cf.closingBalance, sum.cashBalance);

  // ══════════════ 4) DEBITORLIK ══════════════
  head("4) Debitorlik va undirish darajasi");
  const rc = await inBr(() => recvSvc.getReceivables(F));
  eq("kutilgan", rc.totals.expected, 2_900_000);
  eq("undirilgan", rc.totals.collected, 2_000_000);
  eq("qoldiq", rc.totals.outstanding, 900_000);
  near("undirish darajasi %", rc.totals.collectionRate, 68.97, 0.02);
  eq("qarzdor o'quvchilar", rc.totals.debtorStudents, 2);

  head("4b) Yosh tahlili (aging)");
  const wide = { from: monthStart(6).toISOString().slice(0, 10), to: new Date(Date.UTC(Y, MO, 0)).toISOString().slice(0, 10) };
  const ag = await inBr(() => recvSvc.getReceivables(wide));
  eq("60+ kunlik qarz (M−4 plani)", ag.aging.d60plus, 600_000);
  const buckets = ag.aging.notDue + ag.aging.d0_7 + ag.aging.d8_30 + ag.aging.d31_60 + ag.aging.d60plus;
  eq("guruhlar yig'indisi == qoldiq", buckets, ag.totals.outstanding);
  eq("joriy oy qarzi hali muddati kelmagan", ag.aging.notDue, 900_000);

  // ══════════════ 5) O'QITUVCHI FOYDALILIGI ══════════════
  head("5) O'qituvchi foydaliligi + NOANIQ atributsiya");
  const tp = await inBr(() => profitSvc.getTeacherProfitability(F));
  const t1row = tp.items.find((i) => i.teacherId === T1.id);
  // T1: G1 (700k+400k−100k qaytarim) + G2 (500k) = 1 500 000
  eq("T1 daromadi (qaytarim AYIRILGAN)", t1row?.revenue, 1_500_000);
  eq("T1 maoshi", t1row?.payroll, 300_000);
  eq("T1 komissiyasi (payme, G2)", t1row?.fees, 5_000);
  eq("T1 hissa foydasi", t1row?.contributionProfit, 1_195_000);
  near("T1 marjasi %", t1row?.contributionMarginPercent, 79.67, 0.02);
  eq("T1 o'quvchilari (G1:2 + G2:1)", t1row?.students, 3);
  eq("T1 guruhlari", t1row?.groups, 2);
  eq("T2 ga daromad BOG'LANMADI (noaniq)", tp.items.find((i) => i.teacherId === T2.id), undefined);
  eq("G3 daromadi bog'lanmagan qoldi", tp.attribution.unattributedRevenue, 400_000);
  near("atributsiya qamrovi %", tp.attribution.coveragePercent, 78.95, 0.02);
  ok("qoida javobda ko'rsatilgan", tp.attribution.rule.slice(0, 46) + "...");

  // ══════════════ 6) YO'NALISH ══════════════
  head("6) Yo'nalish foydaliligi");
  const dp = await inBr(() => profitSvc.getDirectionProfitability(F));
  const ie = dp.items.find((i) => i.courseId === ielts.id);
  const ge = dp.items.find((i) => i.courseId === general.id);
  eq("IELTS daromadi (G1 1M + G3 400k)", ie?.revenue, 1_400_000);
  eq("IELTS maoshi", ie?.payroll, 300_000);
  eq("IELTS hissa foydasi", ie?.contributionProfit, 1_100_000);
  eq("IELTS o'quvchilari (G1:2 + G3:2)", ie?.students, 4);
  eq("General daromadi", ge?.revenue, 500_000);
  eq("General hissa foydasi (500k − 5k)", ge?.contributionProfit, 495_000);
  eq("eng foydali yo'nalish", dp.rankings.contributionProfit[0].courseId, ielts.id);
  eq("eng yuqori marja General", dp.rankings.contributionMarginPercent[0].courseId, general.id);

  // ══════════════ 7) GURUH ══════════════
  head("7) Guruh foydaliligi");
  const gp = await inBr(() => profitSvc.getGroupProfitability(F));
  const g1 = gp.items.find((i) => i.groupId === G1.id);
  eq("G1 daromadi (1.1M − 100k)", g1?.revenue, 1_000_000);
  eq("G1 ustoz tannarxi", g1?.teacherCost, 300_000);
  eq("G1 chegirmasi", g1?.discounts, 100_000);
  eq("G1 hissa foydasi", g1?.contributionProfit, 700_000);
  eq("G1 qarzi (S2 300k)", g1?.outstanding, 300_000);

  // ══════════════ 8) XONA ══════════════
  head("8) Xona daromadi va bandligi (FOYDA EMAS)");
  const rm = await inBr(() => profitSvc.getRoomRevenue(F));
  const r1 = rm.items.find((i) => i.roomId === R1.id);
  const r2 = rm.items.find((i) => i.roomId === R2.id);
  eq("R1 daromadi (G1 + G3)", r1?.revenue, 1_400_000);
  eq("R2 daromadi (G2)", r2?.revenue, 500_000);
  eq("R1 da 2 guruh", r1?.groups, 2);
  eq("mavjud soat TAXMIN ekani ochiq", rm.availableHoursBasis.assumption, true);
  ok("foyda hisoblanmagani izohlangan", rm.note.slice(0, 40) + "...");
  eq("R1 band soati R2 dan ko'p", r1.occupiedHours > r2.occupiedHours, true);

  // ══════════════ 9) FILIAL ══════════════
  head("9) Filial foydaliligi");
  const bp = await inBr(() => profitSvc.getBranchProfitability(F));
  const bA = bp.items.find((i) => i.branchId === br.id);
  eq("filial daromadi", bA?.revenue, 1_900_000);
  eq("filial hissa foydasi", bA?.contributionProfit, 1_595_000);
  eq("filial qoldig'i", bA?.outstanding, 900_000);

  // ══════════════ 10) TO'LOV KANALLARI ══════════════
  head("10) To'lov kanallari (Faza 12 ko'rinadigan bo'ldi)");
  const pm = await inBr(() => revenueSvc.getPaymentMethodBreakdown(F));
  const byM = Object.fromEntries(pm.map((r) => [r.method, r]));
  eq("click brutto", byM.click?.gross, 700_000);
  eq("payme brutto", byM.payme?.gross, 500_000);
  eq("payme komissiya", byM.payme?.fees, 5_000);
  eq("payme NETTO", byM.payme?.net, 495_000);
  eq("naqd tranzaksiyalar soni", byM.cash?.count, 2);
  eq("naqd brutto", byM.cash?.gross, 800_000);
  near("payme komissiya darajasi %", byM.payme?.feeRatePercent, 1.0, 0.01);

  // ══════════════ 11) CHIQIM ══════════════
  head("11) Chiqim tahlili");
  const eb = await inBr(() => expenseSvc.getExpenseBreakdown(F));
  const rentRow = eb.items.find((i) => i.categoryId === catRent.id);
  const mktRow = eb.items.find((i) => i.categoryId === catMkt.id);
  eq("ijara joriy davr", rentRow?.current, 800_000);
  eq("marketing joriy davr", mktRow?.current, 200_000);
  eq("marketing oldingi davr", mktRow?.previous, 100_000);
  eq("marketing o'sishi %", mktRow?.changePercent, 100);
  eq("eng tez o'sayotgan — marketing", eb.topGrowing[0]?.categoryId, catMkt.id);

  head("11b) Doimiy va o'zgaruvchan xarajat");
  const cs = await inBr(() => expenseSvc.getCostStructure(F));
  eq("doimiy (ijara)", cs.fixed, 800_000);
  eq("o'zgaruvchan (marketing 200k + maosh 300k)", cs.variable, 500_000);
  eq("tasniflanmagan (komissiya)", cs.unclassified, 5_000);
  ok("tasniflanmagan izohlangan", cs.note ? "izoh bor" : "izoh yo'q");

  // ══════════════ 12) BYUDJET ══════════════
  head("12) Byudjet vs fakt");
  const bg = await inBr(() => expenseSvc.getBudgetPerformance(F));
  eq("byudjet topildi", bg.hasBudget, true);
  const rentLine = bg.lines.find((l) => l.categoryId === catRent.id);
  eq("ijara byudjeti", rentLine?.budget, 500_000);
  eq("ijara fakti", rentLine?.actual, 800_000);
  eq("ijara farqi", rentLine?.variance, 300_000);
  eq("ijara farqi %", rentLine?.variancePercent, 60);
  eq("ijara holati", rentLine?.status, "over");
  eq("jami fakt", bg.actualTotal, 1_305_000);
  eq("jami byudjetdan kam", bg.total.variance, -695_000);

  // ══════════════ 13) CHEGIRMA ══════════════
  head("13) Chegirma tahlili");
  const dc = await inBr(() => discountSvc.getDiscountAnalytics(F));
  eq("jami chegirma", dc.total.current, 100_000);
  near("chegirma darajasi % (100k / 3M)", dc.discountRatePercent.current, 3.33, 0.02);

  // ══════════════ 14) QAYTARIM ══════════════
  head("14) Qaytarim tahlili");
  const rf = await inBr(() => revenueSvc.getRefundAnalytics(F));
  eq("qaytarim summasi", rf.amount.current, 100_000);
  eq("qaytarim soni", rf.count.current, 1);
  near("qaytarim darajasi % (100k / 2M brutto)", rf.refundRatePercent.current, 5.0, 0.01);
  ok("formula ko'rsatilgan", rf.refundRatePercent.formula);

  // ══════════════ 15) DAROMAD KESIMI VA DINAMIKA ══════════════
  head("15) Daromad kesimi va dinamikasi");
  const rby = await inBr(() => revenueSvc.getRevenueBy("course", F));
  eq("kurs kesimi 2 qator", rby.length, 2);
  eq("IELTS daromadi", rby.find((r) => r.id === ielts.id)?.revenue, 1_400_000);
  const rt = await inBr(() => revenueSvc.getRevenueTrend(F));
  eq("dinamika nuqtalari bor", rt.points.length > 0, true);
  const trendSum = rt.points.reduce((s, p) => s + p.revenue, 0);
  eq("dinamika yig'indisi == netto daromad", trendSum, 1_900_000);

  // ══════════════ 16) KO'P FILIAL FILTRI ══════════════
  head("16) Filial filtri");
  const other = await inBr(() => summarySvc.getSummary({ ...F, branchId: brB.id }));
  eq("boshqa filialda daromad yo'q", other.revenue.current, 0);
  eq("bo'sh filialda marja null", other.contributionMargin.current, null);

  // ══════════════ 17) NOL / BO'LISH CHEKKA HOLATLARI ══════════════
  head("17) Nol va bo'lish chekka holatlari");
  const empty = await inBr(() => summarySvc.getSummary({ year: 2000, month: 1 }));
  eq("bo'sh davr daromadi 0", empty.revenue.current, 0);
  eq("bo'sh davrda o'zgarish % null", empty.revenue.changePercent, null);
  eq("bo'sh davrda marja null", empty.contributionMargin.current, null);
  const emptyRc = await inBr(() => recvSvc.getReceivables({ year: 2000, month: 1 }));
  eq("kutilgan 0 bo'lsa undirish darajasi null", emptyRc.totals.collectionRate, null);

  // ══════════════ 18) OGOHLANTIRISHLAR ══════════════
  head("18) Ogohlantirish tizimi");
  const al = await inBr(() => alertSvc.getFinancialAlerts(F));
  const codes = al.alerts.map((a) => a.code);
  ok("chiqarilgan ogohlantirishlar", codes.join(", ") || "(yo'q)");
  eq("marketing o'sishi topildi", codes.includes("expense_growth"), true);
  eq("byudjetdan oshish topildi", codes.includes("budget_overspend"), true);
  const growth = al.alerts.find((a) => a.code === "expense_growth");
  eq("ogohlantirishda joriy qiymat bor", growth?.currentValue, 200_000);
  eq("ogohlantirishda taqqoslash qiymati bor", growth?.comparisonValue, 100_000);
  eq("ogohlantirishda subyekt ID si bor", growth?.entities?.expenseCategoryId, catMkt.id);
  ok("izoh haqiqiy raqamlardan", growth?.explanation?.slice(0, 60) + "...");

  // ══════════════ 19) JURNAL BUTUNLIGI ══════════════
  head("19) Jurnal butunligi (tahlil hech narsani buzmadi)");
  const rec = await journal.reconcile();
  eq("reconcile ok", rec.ok, true);
  eq("nomuvozanat yozuv yo'q", rec.unbalancedEntries.length, 0);

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
  if (R.failures.length) { console.log("Muammolar:"); for (const f of R.failures) console.log("  • " + f); }
};

run()
  .catch((err) => { console.error("\nTEST YIQILDI:", err); R.fail += 1; })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
