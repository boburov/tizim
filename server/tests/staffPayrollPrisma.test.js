/**
 * XODIM OYLIGI (staffPayroll) — PostgreSQL (Prisma) USTIDA.
 *
 * Zanjir:
 *   StaffCompensation → computePayroll → StaffPayrollItem (KPI)
 *   → StaffPayrollAdjustment (bonus/jarima/boshlang'ich qarz)
 *   → StaffSalaryTransaction (to'lov) → Journal
 *   → openingBalance materializatsiyasi (PHASE 9)
 *
 * Ko'chishda JIMGINA buzilishi mumkin bo'lgan joylar:
 *   1) ATOMIK TO'LOV. `applyPaidDelta` Mongo'da aggregation update
 *      pipeline edi (status bazadagi joriy paidAmount dan chiqardi).
 *      Postgres'da bitta xom UPDATE. Klamp `GREATEST(0, ...)` bilan.
 *   2) IDEMPOTENTLIK. @@unique([employeeId,year,month]) va
 *      @@unique([employeeId,ruleId,eventKey]) - qayta hisoblash
 *      dublikat yaratmasligi shart.
 *   3) `carriedFrom: {year,month}` Mongo'da ICHKI OBYEKT edi, Prisma'da
 *      YASSILANGAN: carriedFromYear / carriedFromMonth.
 *   4) TARIXIY TO'G'RILIK. Yopilgan (finalized) va to'langan oy qayta
 *      hisoblanmasligi kerak.
 *   5) FILIAL IZOLYATSIYASI.
 *
 * ISHLATISH:  npm run test:staff-payroll
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as payroll from "../src/modules/staffPayroll/services/staffPayroll.service.js";
import * as comp from "../src/modules/staffPayroll/services/staffCompensation.service.js";
import * as adjustment from "../src/modules/staffPayroll/services/staffAdjustment.service.js";
import * as staffTxn from "../src/modules/staffPayroll/services/staffSalaryTransaction.service.js";
import * as history from "../src/modules/staffPayroll/services/payrollHistory.service.js";
import * as kpiRule from "../src/modules/staffPayroll/services/kpiRule.service.js";
import * as openingBalance from "../src/modules/openingBalance/services/openingBalance.service.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";
import { ROLES } from "../src/constants/roles.js";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};
const mustPass = async (name, fn, check) => {
  try {
    const res = await fn();
    const problem = check ? check(res) : null;
    if (problem) bad(name, problem);
    else ok(name);
    return res;
  } catch (err) {
    bad(name, err?.message);
    return null;
  }
};
const mustThrow = async (name, fn, match) => {
  try {
    await fn();
    bad(name, "xato kutilgan edi, lekin o'tib ketdi");
  } catch (err) {
    const msg = err?.message || "";
    if (match && !msg.toLowerCase().includes(match.toLowerCase())) bad(name, `boshqa xato: ${msg}`);
    else ok(name, msg.slice(0, 70));
  }
};

const S = `p${Date.now().toString(36)}`;
const created = { users: [], branches: [], rules: [] };
const YEAR = 2025;

const cleanup = async () => {
  const { users: uids, branches, rules } = created;
  if (uids.length) {
    await prisma.staffSalaryTransaction.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffPayrollItem.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffPayrollAdjustment.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffPayroll.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffCompensation.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.staffKpiAssignment.deleteMany({ where: { employeeId: { in: uids } } });
    await prisma.payrollAuditLog.deleteMany({
      where: { OR: [{ employeeId: { in: uids } }, { actorId: { in: uids } }] },
    });
    await prisma.openingBalance.deleteMany({ where: { userId: { in: uids } } });
  }
  if (rules.length) {
    await prisma.staffPayrollItem.deleteMany({ where: { ruleId: { in: rules } } });
    await prisma.staffKpiAssignment.deleteMany({ where: { ruleId: { in: rules } } });
    await prisma.kpiRule.deleteMany({ where: { id: { in: rules } } });
  }
  if (branches.length) {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: branches } }, select: { id: true },
    });
    if (entries.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    }
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: branches } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: branches } } });
  }
  if (uids.length) await prisma.user.deleteMany({ where: { id: { in: uids } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkStaff = async (name, branchId, role = "reception") => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "Xodim",
      username: `${name.toLowerCase()}_${S}`, passwordHash: "x",
      role, homeBranchId: branchId, hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== XODIM OYLIGI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const bA = await prisma.branch.create({ data: { name: `Payroll A ${S}` } });
  const bB = await prisma.branch.create({ data: { name: `Payroll B ${S}` } });
  created.branches.push(bA.id, bB.id);

  const e1 = await mkStaff("Anvar", bA.id);
  const e2 = await mkStaff("Bobur", bA.id);
  const eB = await mkStaff("Begona", bB.id);

  const scopeA = { branchId: bA.id, allowedBranchIds: [bA.id], canSeeAllBranches: false, userId: null };
  const scopeB = { branchId: bB.id, allowedBranchIds: [bB.id], canSeeAllBranches: false, userId: null };
  const inA = (fn) => runWithBranchContext(scopeA, fn);
  const inB = (fn) => runWithBranchContext(scopeB, fn);

  // ── 1) SHARTNOMA ─────────────────────────────────────────────────
  console.log("1) maosh shartnomasi");

  await mustPass(
    "shartnoma o'rnatiladi",
    () => inA(() => comp.setCompensation(
      { employee: e1.id, salaryType: "fixed", baseAmount: 3_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), branchId: bA.id },
      { id: null },
    )),
    (c) => (c?.baseAmount === 3_000_000 && c._id ? null : "shartnoma yozilmadi"),
  );

  await mustPass(
    "oshirish ESKISINI YOPADI (bitta ochiq invarianti)",
    async () => {
      await inA(() => comp.setCompensation(
        { employee: e1.id, salaryType: "fixed", baseAmount: 4_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 5, 1)), branchId: bA.id },
        { id: null },
      ));
      return prisma.staffCompensation.findMany({
        where: { employeeId: e1.id, isDeleted: false },
        orderBy: { effectiveFrom: "asc" },
      });
    },
    (rows) => {
      if (rows.length !== 2) return `${rows.length} ta shartnoma`;
      if (rows[0].effectiveTo?.getTime() !== Date.UTC(YEAR, 5, 1)) return "eskisi yopilmadi";
      if (rows[1].effectiveTo !== null) return "yangisi ochiq emas";
      return null;
    },
  );

  await mustThrow(
    "orqaga surilgan shartnoma rad etiladi",
    () => inA(() => comp.setCompensation(
      { employee: e1.id, salaryType: "fixed", baseAmount: 9_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 2, 1)), branchId: bA.id },
      { id: null },
    )),
    "keyin boshlanishi kerak",
  );

  await mustThrow(
    "qisman unique indeks IKKINCHI ochiq shartnomani to'sadi",
    () => prisma.staffCompensation.create({
      data: { employeeId: e1.id, branchId: bA.id, salaryType: "fixed", baseAmount: 1, effectiveFrom: new Date(Date.UTC(YEAR, 8, 1)) },
    }),
    "unique",
  );

  // ── 2) HISOBLASH VA IDEMPOTENTLIK ────────────────────────────────
  console.log("\n2) hisoblash, proratsiya, idempotentlik");

  const jan = await mustPass(
    "yanvar oyligi = 3 000 000 (to'liq oy, eski stavka)",
    () => payroll.computePayroll(e1.id, YEAR, 1),
    (p) => {
      if (p?.finalAmount !== 3_000_000) return `finalAmount=${p?.finalAmount}`;
      if (p.payableDays !== 31) return `payableDays=${p.payableDays}`;
      if (!p._id) return "_id taxallusi yo'q";
      return null;
    },
  );

  await mustPass(
    "iyul oyligi YANGI stavkada (4 000 000), yanvar O'ZGARMAYDI",
    async () => {
      const jul = await payroll.computePayroll(e1.id, YEAR, 7);
      const janAgain = await prisma.staffPayroll.findUnique({ where: { id: jan.id } });
      return { jul, janAgain };
    },
    ({ jul, janAgain }) => {
      if (jul?.finalAmount !== 4_000_000) return `iyul=${jul?.finalAmount}`;
      if (janAgain.finalAmount !== 3_000_000) return `yanvar buzildi: ${janAgain.finalAmount}`;
      return null;
    },
  );

  await mustPass(
    "SEGMENT: iyun oyi ikki stavkaga bo'linadi",
    () => payroll.computePayroll(e1.id, YEAR, 6),
    (p) => {
      // Iyun 30 kun; 1-iyundan yangi stavka boshlangan → butun oy 4 mln.
      if (p?.finalAmount !== 4_000_000) return `iyun=${p?.finalAmount}`;
      if (p.payableDays !== 30) return `payableDays=${p.payableDays}`;
      return null;
    },
  );

  await mustPass(
    "IDEMPOTENT: qayta hisoblash dublikat yaratmaydi",
    async () => {
      await payroll.computePayroll(e1.id, YEAR, 1);
      await payroll.computePayroll(e1.id, YEAR, 1);
      return prisma.staffPayroll.count({ where: { employeeId: e1.id, year: YEAR, month: 1 } });
    },
    (n) => (n === 1 ? null : `${n} ta qator`),
  );

  await mustThrow(
    "unique indeks ikkinchi oylik qatorini TO'SADI",
    () => prisma.staffPayroll.create({
      data: { employeeId: e1.id, year: YEAR, month: 1, branchId: bA.id },
    }),
    "unique",
  );

  await mustPass(
    "payrollStartFrom dan OLDINGI oy yaratilmaydi",
    async () => {
      await prisma.user.update({
        where: { id: e2.id },
        data: { payrollStartFrom: new Date(Date.UTC(YEAR, 5, 1)) },
      });
      await inA(() => comp.setCompensation(
        { employee: e2.id, salaryType: "fixed", baseAmount: 2_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      const early = await payroll.computePayroll(e2.id, YEAR, 3);
      const later = await payroll.computePayroll(e2.id, YEAR, 7);
      return { early, later };
    },
    ({ early, later }) => {
      if (early !== null) return `chegaradan oldingi oy yaratildi: ${early?.finalAmount}`;
      if (later?.finalAmount !== 2_000_000) return `keyingi oy=${later?.finalAmount}`;
      return null;
    },
  );

  // ── 3) BONUS / JARIMA ────────────────────────────────────────────
  console.log("\n3) bonus, jarima va o'zgarmas davr");

  await mustPass(
    "bonus qo'shiladi va oylik summa oshadi",
    async () => {
      await inA(() => adjustment.create(
        { employee: e1.id, year: YEAR, month: 1, kind: "bonus", amount: 500_000, reason: "test bonus" },
        { id: null },
      ));
      return prisma.staffPayroll.findUnique({ where: { id: jan.id } });
    },
    (p) => {
      if (p.manualBonusTotal !== 500_000) return `bonus=${p.manualBonusTotal}`;
      if (p.finalAmount !== 3_500_000) return `finalAmount=${p.finalAmount}`;
      return null;
    },
  );

  await mustPass(
    "jarima summani kamaytiradi",
    async () => {
      await inA(() => adjustment.create(
        { employee: e1.id, year: YEAR, month: 1, kind: "penalty", amount: 200_000, reason: "test jarima" },
        { id: null },
      ));
      return prisma.staffPayroll.findUnique({ where: { id: jan.id } });
    },
    (p) => (p.finalAmount === 3_300_000 ? null : `finalAmount=${p.finalAmount}`),
  );

  await mustThrow(
    "sababsiz bonus rad etiladi",
    () => inA(() => adjustment.create(
      { employee: e1.id, year: YEAR, month: 1, kind: "bonus", amount: 1000, reason: "  " },
      { id: null },
    )),
    "sabab",
  );

  // ── 4) TO'LOV (ATOMIK) ───────────────────────────────────────────
  console.log("\n4) to'lov, atomiklik va jurnal");

  await mustPass(
    "to'lov yoziladi, status partial, jurnal muvozanatda",
    async () => {
      const trx = await inA(() => staffTxn.create(
        { payrollId: jan.id, amount: 1_000_000, method: "cash", note: "avans" },
        { id: null, permissions: ["*"] },
      ));
      const fresh = await prisma.staffPayroll.findUnique({ where: { id: jan.id } });
      const entry = await prisma.journalEntry.findFirst({
        where: { refId: trx.id, refModel: "StaffSalaryTransaction" },
        include: { lines: true },
      });
      return { trx, fresh, entry };
    },
    ({ trx, fresh, entry }) => {
      if (!trx?.id) return "tranzaksiya yaratilmadi";
      if (fresh.paidAmount !== 1_000_000 || fresh.status !== "partial") {
        return `paid=${fresh.paidAmount}/${fresh.status}`;
      }
      if (!entry) return "jurnal yozuvi yo'q";
      if (entry.totalDebit !== entry.totalCredit) return "jurnal nomuvozanat";
      return null;
    },
  );

  await mustThrow(
    "qoldiqdan ORTIQ to'lov rad etiladi (capToRemaining)",
    () => inA(() => staffTxn.create(
      { payrollId: jan.id, amount: 99_000_000, method: "cash" },
      { id: null, permissions: ["*"] },
    )),
    "qoldiqdan oshib",
  );

  await mustPass(
    "to'liq to'lov statusni `paid` qiladi",
    async () => {
      await inA(() => staffTxn.create(
        { payrollId: jan.id, amount: 2_300_000, method: "cash" },
        { id: null, permissions: ["*"] },
      ));
      return prisma.staffPayroll.findUnique({ where: { id: jan.id } });
    },
    (p) => (p.paidAmount === 3_300_000 && p.status === "paid" ? null : `${p.paidAmount}/${p.status}`),
  );

  await mustPass(
    "TO'LANGAN oy qayta hisoblanmaydi (o'zgarmas davr)",
    async () => {
      const before = await prisma.staffPayroll.findUnique({ where: { id: jan.id } });
      // Shartnoma o'zgarganday ko'rsatib qayta hisoblaymiz.
      await payroll.computePayroll(e1.id, YEAR, 1);
      const after = await prisma.staffPayroll.findUnique({ where: { id: jan.id } });
      return { before, after };
    },
    ({ before, after }) =>
      before.finalAmount === after.finalAmount && before.computedAt?.getTime() === after.computedAt?.getTime()
        ? null
        : "to'langan oy qayta yozildi",
  );

  await mustPass(
    "to'lovni bekor qilish balansni qaytaradi",
    async () => {
      const trx = await prisma.staffSalaryTransaction.findFirst({
        where: { payrollId: jan.id, isDeleted: false }, orderBy: { createdAt: "desc" },
      });
      await inA(() => staffTxn.remove(trx.id, { id: null }));
      return prisma.staffPayroll.findUnique({ where: { id: jan.id } });
    },
    (p) => (p.status === "partial" ? null : `status=${p.status}, paid=${p.paidAmount}`),
  );

  // ── 5) HAYOT-TSIKL (qulf) ────────────────────────────────────────
  console.log("\n5) oyni yopish va qayta ochish");

  const jul = await prisma.staffPayroll.findUnique({
    where: { employeeId_year_month: { employeeId: e1.id, year: YEAR, month: 7 } },
  });

  await mustPass(
    "oy yopiladi (finalized)",
    () => inA(() => payroll.setLifecycle(jul.id, "finalized", { id: null })),
    (p) => (p?.lifecycle === "finalized" && p.finalizedAt ? null : `lifecycle=${p?.lifecycle}`),
  );

  await mustPass(
    "YOPILGAN oy qayta hisoblanmaydi",
    async () => {
      const before = await prisma.staffPayroll.findUnique({ where: { id: jul.id } });
      await payroll.computePayroll(e1.id, YEAR, 7);
      const after = await prisma.staffPayroll.findUnique({ where: { id: jul.id } });
      return { before, after };
    },
    ({ before, after }) =>
      before.computedAt?.getTime() === after.computedAt?.getTime()
        ? null
        : "yopilgan oy qayta hisoblandi",
  );

  await mustThrow(
    "qulfni SABABSIZ ochib bo'lmaydi",
    () => inA(() => payroll.setLifecycle(jul.id, "draft", { id: null }, { reason: "  " })),
    "sababini",
  );

  await mustPass(
    "sabab bilan ochiladi va darhol qayta hisoblanadi",
    async () => {
      await inA(() => payroll.setLifecycle(jul.id, "draft", { id: null }, { reason: "xato topildi" }));
      return prisma.staffPayroll.findUnique({ where: { id: jul.id } });
    },
    (p) => {
      if (p.lifecycle !== "draft") return `lifecycle=${p.lifecycle}`;
      if (p.finalizedAt !== null) return "finalizedAt tozalanmadi";
      return null;
    },
  );

  await mustPass(
    "audit jurnali LOCKED/UNLOCKED yozuvlarini saqlaydi",
    () => prisma.payrollAuditLog.findMany({
      where: { employeeId: e1.id, action: { in: ["payroll.locked", "payroll.unlocked"] } },
    }),
    (rows) => (rows.length >= 2 ? null : `${rows.length} ta audit yozuvi`),
  );

  // ── 6) BOSHLANG'ICH QARZ KO'CHIRISHI ─────────────────────────────
  console.log("\n6) boshlang'ich qarz ko'chirishi (carriedFrom yassilangan)");

  await mustPass(
    "ushlab qolinmagan qarz keyingi oyga ko'chadi",
    async () => {
      const e3 = await mkStaff("Qarzdor", bA.id);
      await inA(() => comp.setCompensation(
        { employee: e3.id, salaryType: "fixed", baseAmount: 1_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      // 3 mln qarz, 1 mln oylik → 1 mln ushlanadi, 2 mln qoladi.
      await prisma.staffPayrollAdjustment.create({
        data: { employeeId: e3.id, branchId: bA.id, year: YEAR, month: 3, kind: "opening_debt", amount: 3_000_000, reason: "boshlang'ich" },
      });
      const march = await payroll.computePayroll(e3.id, YEAR, 3);
      const res = await payroll.carryOverOpeningDebt(YEAR, 4);
      const carried = await prisma.staffPayrollAdjustment.findFirst({
        where: { employeeId: e3.id, year: YEAR, month: 4, kind: "opening_debt" },
      });
      // IDEMPOTENTLIK: ikkinchi marta ko'chirish yangi qator yaratmasin.
      await payroll.carryOverOpeningDebt(YEAR, 4);
      const count = await prisma.staffPayrollAdjustment.count({
        where: { employeeId: e3.id, year: YEAR, month: 4, kind: "opening_debt" },
      });
      return { march, res, carried, count };
    },
    ({ march, res, carried, count }) => {
      if (march.openingDebtTotal !== 3_000_000) return `qarz=${march.openingDebtTotal}`;
      if (march.openingDebtApplied !== 1_000_000) return `ushlangan=${march.openingDebtApplied}`;
      if (march.finalAmount !== 0) return `finalAmount=${march.finalAmount}`;
      if (!res.carried) return "ko'chirilmadi";
      if (!carried) return "ko'chirilgan qator yo'q";
      if (carried.amount !== 2_000_000) return `ko'chirilgan summa=${carried.amount}`;
      // Mongo'dagi `carriedFrom: {year, month}` YASSILANGAN.
      if (carried.carriedFromYear !== YEAR || carried.carriedFromMonth !== 3) {
        return `carriedFrom=${carried.carriedFromYear}/${carried.carriedFromMonth}`;
      }
      if (count !== 1) return `IDEMPOTENTLIK BUZILDI: ${count} ta qator`;
      return null;
    },
  );

  // ── 7) KPI ───────────────────────────────────────────────────────
  console.log("\n7) KPI qoidalari");

  await mustPass(
    "KPI qoidasi yaratiladi va biriktiriladi",
    async () => {
      const rule = await kpiRule.create(
        {
          name: `Test KPI ${S}`, trigger: "employee_attendance",
          rewardType: "per_unit", rewardValue: 10_000, applicableRoles: [],
        },
        { id: null },
      );
      created.rules.push(rule.id);
      const a = await kpiRule.setAssignment({ employee: e1.id, rule: rule.id }, { id: null });
      return { rule, a };
    },
    ({ rule, a }) => {
      if (!rule?.id) return "qoida yaratilmadi";
      if (!a?.id) return "biriktiruv yaratilmadi";
      return null;
    },
  );

  await mustPass(
    "setAssignment IDEMPOTENT (qisman unique kalit)",
    async () => {
      const ruleId = created.rules[0];
      await kpiRule.setAssignment({ employee: e1.id, rule: ruleId, rewardValueOverride: 20_000 }, { id: null });
      const rows = await prisma.staffKpiAssignment.findMany({
        where: { employeeId: e1.id, ruleId, isDeleted: false },
      });
      return rows;
    },
    (rows) => {
      if (rows.length !== 1) return `${rows.length} ta biriktiruv`;
      if (rows[0].rewardValueOverride !== 20_000) return `override=${rows[0].rewardValueOverride}`;
      return null;
    },
  );

  await mustPass(
    "KPI qatorlari kpi_only shartnomada quriladi va IDEMPOTENT",
    async () => {
      const e4 = await mkStaff("Kpichi", bA.id);
      await inA(() => comp.setCompensation(
        { employee: e4.id, salaryType: "kpi_only", effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      await kpiRule.setAssignment({ employee: e4.id, rule: created.rules[0] }, { id: null });
      const p1 = await payroll.computePayroll(e4.id, YEAR, 2);
      const p2 = await payroll.computePayroll(e4.id, YEAR, 2);
      const items = await prisma.staffPayrollItem.findMany({
        where: { employeeId: e4.id, year: YEAR, month: 2 },
      });
      return { p1, p2, items };
    },
    ({ p1, p2, items }) => {
      // employee_attendance triggeri yig'ma bitta qator beradi.
      if (items.length !== 1) return `${items.length} ta KPI qatori (1 kutilgan - dublikat!)`;
      if (p1.autoKpiTotal !== p2.autoKpiTotal) return "qayta hisob boshqa natija berdi";
      if (p1.fixedAmount !== 0) return `kpi_only da fiksa=${p1.fixedAmount}`;
      return null;
    },
  );

  // ── 8) TARIX VA PREVIEW ──────────────────────────────────────────
  console.log("\n8) tarix boshqaruvi");

  await mustPass(
    "getImpact tarixni birlashtiradi",
    () => history.getImpact(e1.id),
    (r) => {
      if (!r?.hasHistory) return "tarix topilmadi";
      if (!r.monthCount) return "oy soni 0";
      if (!r.employee?._id) return "_id taxallusi yo'q";
      return null;
    },
  );

  await mustPass(
    "previewGenerate hech narsa YOZMAYDI",
    async () => {
      const before = await prisma.staffPayroll.count({ where: { employeeId: e1.id } });
      const res = await history.previewGenerate({
        employeeId: e1.id,
        from: new Date(Date.UTC(YEAR, 0, 1)),
        to: new Date(Date.UTC(YEAR, 3, 1)),
      });
      const after = await prisma.staffPayroll.count({ where: { employeeId: e1.id } });
      return { res, before, after };
    },
    ({ res, before, after }) => {
      if (before !== after) return "preview qator yaratdi";
      if (!res.rows.length) return "qatorlar bo'sh";
      if (!res.rows.some((r) => r.action === "locked" || r.action === "exists")) {
        return "mavjud oylar aniqlanmadi";
      }
      return null;
    },
  );

  await mustThrow(
    "maosh tarixi bor xodimda payrollStartFrom TASDIQSIZ o'zgarmaydi",
    () => history.setPayrollStart(e1.id, new Date(Date.UTC(YEAR, 0, 1)), { currentUser: { id: null } }),
    "tasdiqlanishi",
  );

  // ── 9) FILIAL IZOLYATSIYASI ──────────────────────────────────────
  console.log("\n9) filial izolyatsiyasi va ruxsat");

  await inA(() => comp.setCompensation(
    { employee: eB.id, salaryType: "fixed", baseAmount: 5_000_000, effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), branchId: bB.id },
    { id: null },
  ));
  const bPayroll = await payroll.computePayroll(eB.id, YEAR, 1);

  await mustPass(
    "A filial ro'yxatida B filial xodimi YO'Q",
    () => inA(() => payroll.list({ year: YEAR, limit: 500 })),
    (r) => (r.items.some((p) => p.employeeId === eB.id) ? "B filial maoshi sizib chiqdi" : null),
  );

  await mustPass(
    "employeeId berilsa ham filial sharti SAQLANADI",
    () => inA(() => payroll.list({ employeeId: eB.id, limit: 500 })),
    (r) => (r.items.length ? "ID orqali boshqa filial maoshi ochildi" : null),
  );

  await mustThrow(
    "A kontekstida B filial maoshiga to'lov yozib bo'lmaydi",
    () => inA(() => staffTxn.create(
      { payrollId: bPayroll.id, amount: 100_000, method: "cash" },
      { id: null, permissions: ["*"] },
    )),
    "filial",
  );

  await mustPass(
    "B kontekstida O'Z filiali ko'rinadi",
    () => inB(() => payroll.list({ year: YEAR, limit: 500 })),
    (r) => (r.items.some((p) => p.employeeId === eB.id) ? null : "o'z filiali ko'rinmadi"),
  );

  // ── 10) OPENING BALANCE ZANJIRI (PHASE 9) ────────────────────────
  console.log("\n10) boshlang'ich qoldiq → staffPayroll zanjiri");

  await mustPass(
    "MANFIY qoldiq (xodim qarzdor) opening_debt bo'lib materializatsiya bo'ladi",
    async () => {
      const e5 = await mkStaff("Manfiy", bA.id);
      await inA(() => comp.setCompensation(
        { employee: e5.id, salaryType: "fixed", baseAmount: 2_000_000, effectiveFrom: new Date(Date.UTC(2024, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      const res = await inA(() => openingBalance.create(
        { user: e5.id, role: "staff", amount: -3_000_000, branchId: bA.id },
        { currentUser: { id: null } },
      ));
      const ob = await prisma.openingBalance.findUnique({ where: { userId: e5.id } });
      const adj = await prisma.staffPayrollAdjustment.findFirst({
        where: { employeeId: e5.id, kind: "opening_debt" },
      });
      return { res, ob, adj, e5 };
    },
    ({ res, ob, adj }) => {
      if (res?.status !== "created") return `status=${res?.status}`;
      // ISHORA SAQLANISHI SHART - `party` konvensiyasi.
      if (ob.amount !== -3_000_000) return `saqlangan summa=${ob.amount} (manfiy bo'lishi kerak)`;
      if (ob.signConvention !== "party") return `signConvention=${ob.signConvention}`;
      if (ob.kind !== "staff_debt") return `kind=${ob.kind}`;
      // `pendingReason` bazada "" lekin Prisma klientida "none".
      if (ob.pendingReason !== "none") return `pendingReason=${ob.pendingReason}`;
      if (!ob.materializedAt) return "materializatsiya bajarilmadi";
      if (!adj) return "StaffPayrollAdjustment yaratilmadi";
      // Tuzatish qatorida summa MUTLAQ qiymatda, ishora `kind` da.
      if (adj.amount !== 3_000_000) return `adj.amount=${adj.amount}`;
      return null;
    },
  );

  await mustPass(
    "MUSBAT qoldiq (markaz qarzdor) opening_credit bo'ladi",
    async () => {
      const e6 = await mkStaff("Musbat", bA.id);
      await inA(() => comp.setCompensation(
        { employee: e6.id, salaryType: "fixed", baseAmount: 1_000_000, effectiveFrom: new Date(Date.UTC(2024, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      await inA(() => openingBalance.create(
        { user: e6.id, role: "staff", amount: 700_000, branchId: bA.id },
        { currentUser: { id: null } },
      ));
      const ob = await prisma.openingBalance.findUnique({ where: { userId: e6.id } });
      const adj = await prisma.staffPayrollAdjustment.findFirst({
        where: { employeeId: e6.id, kind: "opening_credit" },
      });
      const p = await prisma.staffPayroll.findFirst({
        where: { employeeId: e6.id, year: adj.year, month: adj.month },
      });
      return { ob, adj, p };
    },
    ({ ob, adj, p }) => {
      if (ob.amount !== 700_000) return `saqlangan=${ob.amount}`;
      if (ob.kind !== "staff_credit") return `kind=${ob.kind}`;
      if (!adj) return "opening_credit qatori yo'q";
      if (!p) return "oylik qatori qurilmadi (zanjir uzilgan)";
      if (p.openingCreditTotal !== 700_000) return `openingCreditTotal=${p.openingCreditTotal}`;
      return null;
    },
  );

  await mustPass(
    "TAKRORIY import PULNI IKKI MARTA YOZMAYDI (duplicate)",
    async () => {
      const e7 = await mkStaff("Takror", bA.id);
      await inA(() => comp.setCompensation(
        { employee: e7.id, salaryType: "fixed", baseAmount: 1_000_000, effectiveFrom: new Date(Date.UTC(2024, 0, 1)), branchId: bA.id },
        { id: null },
      ));
      const first = await inA(() => openingBalance.create(
        { user: e7.id, role: "staff", amount: -500_000, branchId: bA.id },
        { currentUser: { id: null } },
      ));
      const second = await inA(() => openingBalance.create(
        { user: e7.id, role: "staff", amount: -500_000, branchId: bA.id },
        { currentUser: { id: null } },
      ));
      const adjCount = await prisma.staffPayrollAdjustment.count({
        where: { employeeId: e7.id, kind: "opening_debt" },
      });
      return { first, second, adjCount };
    },
    ({ first, second, adjCount }) => {
      if (first?.status !== "created") return `birinchi=${first?.status}`;
      if (second?.status !== "duplicate") return `ikkinchi=${second?.status} (duplicate kutilgan)`;
      if (adjCount !== 1) return `${adjCount} ta tuzatish qatori (PUL IKKI MARTA!)`;
      return null;
    },
  );

  await mustPass(
    "NOL qoldiq rad etiladi",
    async () => {
      const e8 = await mkStaff("Nol", bA.id);
      let msg = "";
      try {
        await inA(() => openingBalance.create(
          { user: e8.id, role: "staff", amount: 0, branchId: bA.id },
          { currentUser: { id: null } },
        ));
      } catch (e) {
        msg = e.message;
      }
      const count = await prisma.openingBalance.count({ where: { userId: e8.id } });
      return { msg, count };
    },
    ({ msg, count }) => {
      if (!/nolga teng bo'lmagan/i.test(msg)) return `boshqa xato: ${msg}`;
      if (count !== 0) return "nol qoldiq yozildi";
      return null;
    },
  );

  await mustPass(
    "repairPending idempotent - ikkinchi marta qator yaratmaydi",
    async () => {
      const before = await prisma.staffPayrollAdjustment.count({
        where: { employeeId: { in: created.users }, kind: { in: ["opening_debt", "opening_credit"] } },
      });
      await openingBalance.repairPending({ currentUser: { id: null } });
      const after = await prisma.staffPayrollAdjustment.count({
        where: { employeeId: { in: created.users }, kind: { in: ["opening_debt", "opening_credit"] } },
      });
      return { before, after };
    },
    ({ before, after }) => (before === after ? null : `${before} → ${after} (dublikat yaratildi)`),
  );

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
};

run()
  .catch((err) => {
    console.error("\nTEST YIQILDI:", err);
    R.fail += 1;
  })
  .finally(async () => {
    await cleanup().catch((e) => console.error("tozalash xatosi:", e.message));
    await prisma.$disconnect();
    process.exit(R.fail > 0 ? 1 : 0);
  });
