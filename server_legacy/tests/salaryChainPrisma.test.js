/**
 * MAOSH ZANJIRI — PostgreSQL (Prisma) USTIDA.
 *
 * Zanjir:  TeacherCompensation → rateResolver → variableBase → TeacherSalary
 *          → SalaryTransaction (to'lov) → Journal (qo'sh yozuv)
 * Va yon tomondan: GroupFee → StudentPayment (foiz maoshining bazasi).
 *
 * NEGA AYNAN SHU TEKSHIRUVLAR: quyidagilarning har biri Mongo→Prisma
 * ko'chishida JIMGINA buzilishi mumkin edi - kod ishlagandek ko'rinib,
 * PUL noto'g'ri chiqardi:
 *
 *   1) ATOMIK STATUS. Mongo `paidAmount`/`status` ni aggregation update
 *      pipeline bilan yozardi. Prisma'da bunday quvur yo'q - xom SQL va
 *      `FOR UPDATE` bilan almashtirildi. Noto'g'ri ko'chirilsa "o'qi →
 *      hisobla → yoz" poygasi qaytib kelardi (yo'qolgan to'lov).
 *   2) IDEMPOTENTLIK. Qisman unique indekslar (teacherId, groupId, year,
 *      month, kind) va (teacherId, year, month, kind='base') - ular
 *      bo'lmasa o'qituvchi bir oy uchun IKKI marta to'lanardi.
 *   3) SEGMENTLAR. Oy o'rtasida stavka o'zgarsa har segment o'z
 *      kunlariga proratsiya bo'lishi kerak; kesishgan stavkalarda esa
 *      bir kun IKKI marta to'lanmasligi kerak.
 *   4) TARIXIY ANIQLIK. Martdagi oshirish yanvarni O'ZGARTIRMASLIGI shart.
 *   5) QULF. `isLocked` va to'langan oy (`lockPaid`) qayta yozilmasligi.
 *   6) FILIAL IZOLYATSIYASI.
 *   7) JURNAL MUVOZANATI - Mongoose pre-save hook'i yo'qoldi, tekshiruv
 *      endi kodda.
 *
 * ISHLATISH:  npm run test:salary-chain
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as comp from "../src/modules/teacherSalary/services/teacherCompensation.service.js";
import * as salary from "../src/modules/teacherSalary/services/teacherSalary.service.js";
import * as salaryTxn from "../src/modules/teacherSalary/services/salaryTransaction.service.js";
import * as adjustment from "../src/modules/teacherSalary/services/salaryAdjustment.service.js";
import * as groupFee from "../src/modules/finance/services/groupFee.service.js";
import * as journal from "../src/modules/journal/services/journal.service.js";
import { compensationsForRange, baseSegmentsForMonth } from "../src/modules/teacherSalary/services/rateResolver.helper.js";
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

const S = `s${Date.now().toString(36)}`;
const created = { users: [], groups: [], branches: [] };

const cleanup = async () => {
  const { users, groups, branches } = created;
  if (users.length) {
    await prisma.salaryTransaction.deleteMany({ where: { teacherId: { in: users } } });
    await prisma.teacherSalary.deleteMany({ where: { teacherId: { in: users } } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { teacherId: { in: users } } });
    await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: users } } });
    await prisma.studentPayment.deleteMany({ where: { studentId: { in: users } } });
    await prisma.groupMembership.deleteMany({ where: { studentId: { in: users } } });
  }
  if (groups.length) {
    await prisma.studentPayment.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupFee.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.teacherSalary.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: groups } } });
    for (const g of groups) {
      await prisma.group.update({ where: { id: g }, data: { teachers: { set: [] } } }).catch(() => {});
    }
    await prisma.group.deleteMany({ where: { id: { in: groups } } });
  }
  if (branches.length) {
    const entries = await prisma.journalEntry.findMany({
      where: { branchId: { in: branches } },
      select: { id: true },
    });
    if (entries.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
    }
    await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: branches } } } });
    await prisma.account.deleteMany({ where: { branchId: { in: branches } } });
  }
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkTeacher = async (name, branchId, hiredAt = new Date(Date.UTC(2024, 0, 1))) => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "Maosh",
      username: `${name.toLowerCase()}_${S}`, passwordHash: "x",
      role: ROLES.TEACHER, homeBranchId: branchId, hiredAt,
    },
  });
  created.users.push(u.id);
  return u;
};

const mkGroup = async (name, branchId) => {
  const g = await prisma.group.create({
    data: {
      name: `${name} ${S}`, branchId,
      startDate: new Date(Date.UTC(2024, 0, 1)),
      schedule: { create: [{ day: "mon", startTime: "09:00", endTime: "10:30" }] },
    },
  });
  created.groups.push(g.id);
  return g;
};

const YEAR = 2025;

const run = async () => {
  console.log("\n=== MAOSH ZANJIRI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const bA = await prisma.branch.create({ data: { name: `Maosh A ${S}` } });
  const bB = await prisma.branch.create({ data: { name: `Maosh B ${S}` } });
  created.branches.push(bA.id, bB.id);

  const t1 = await mkTeacher("Fiksa", bA.id);
  const t2 = await mkTeacher("Foiz", bA.id);
  const tB = await mkTeacher("Begona", bB.id);

  const g1 = await mkGroup("G1", bA.id);
  const g2 = await mkGroup("G2", bA.id);

  const scope = { branchId: bA.id, allowedBranchIds: [bA.id], canSeeAllBranches: false, userId: null };
  const inA = (fn) => runWithBranchContext(scope, fn);

  // ── 1) STANDART STAVKA (TeacherCompensation) ─────────────────────
  console.log("1) standart stavka va uning tarixi");

  await mustPass(
    "fiksa oylik stavkasi o'rnatiladi (2 000 000)",
    () => inA(() => comp.setCompensation(
      { teacher: t1.id, effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)), baseType: "fixed_monthly", baseAmount: 2_000_000, branchId: bA.id },
      { id: null },
    )),
    (r) => (r?.baseAmount === 2_000_000 && r._id ? null : "stavka yozilmadi"),
  );

  await mustPass(
    "1-mart dan oshirish ESKISINI YOPADI (bitta ochiq stavka)",
    async () => {
      await inA(() => comp.setCompensation(
        { teacher: t1.id, effectiveFrom: new Date(Date.UTC(YEAR, 2, 1)), baseType: "fixed_monthly", baseAmount: 3_000_000, branchId: bA.id },
        { id: null },
      ));
      return prisma.teacherCompensation.findMany({
        where: { teacherId: t1.id, isDeleted: false },
        orderBy: { effectiveFrom: "asc" },
      });
    },
    (rows) => {
      if (rows.length !== 2) return `${rows.length} ta stavka`;
      if (rows[0].effectiveTo?.getTime() !== Date.UTC(YEAR, 2, 1)) return "eskisi yopilmadi";
      if (rows[1].effectiveTo !== null) return "yangisi ochiq emas";
      return null;
    },
  );

  await mustThrow(
    "orqaga surilgan stavka rad etiladi (bitta ochiq invarianti)",
    () => inA(() => comp.setCompensation(
      { teacher: t1.id, effectiveFrom: new Date(Date.UTC(YEAR, 1, 1)), baseType: "fixed_monthly", baseAmount: 9_000_000, branchId: bA.id },
      { id: null },
    )),
    "keyin boshlanishi kerak",
  );

  await mustPass(
    "compensationsForRange oraliqni to'g'ri kesadi",
    async () => ({
      jan: await compensationsForRange(t1.id, new Date(Date.UTC(YEAR, 0, 1)), new Date(Date.UTC(YEAR, 1, 1))),
      apr: await compensationsForRange(t1.id, new Date(Date.UTC(YEAR, 3, 1)), new Date(Date.UTC(YEAR, 4, 1))),
    }),
    ({ jan, apr }) => {
      if (jan.length !== 1 || jan[0].baseAmount !== 2_000_000) return "yanvar noto'g'ri";
      if (apr.length !== 1 || apr[0].baseAmount !== 3_000_000) return "aprel noto'g'ri";
      return null;
    },
  );

  // ── 2) FIKSA OYLIK QATORI (kind=base) ────────────────────────────
  console.log("\n2) markaz fiksa oyligi (kind=base)");

  const janRow = await mustPass(
    "yanvar fiksa oyligi = 2 000 000 (to'liq oy)",
    () => salary.recalcBaseForTeacherMonth(t1.id, YEAR, 1),
    (r) => (r?.expectedAmount === 2_000_000 ? null : `expected=${r?.expectedAmount}`),
  );

  await mustPass(
    "IDEMPOTENT: qayta chaqirish dublikat yaratmaydi",
    async () => {
      await salary.recalcBaseForTeacherMonth(t1.id, YEAR, 1);
      await salary.recalcBaseForTeacherMonth(t1.id, YEAR, 1);
      return prisma.teacherSalary.count({
        where: { teacherId: t1.id, groupId: null, kind: "base", year: YEAR, month: 1 },
      });
    },
    (n) => (n === 1 ? null : `${n} ta qator`),
  );

  await mustThrow(
    "qisman unique indeks ikkinchi base qatorini TO'SADI",
    () => prisma.teacherSalary.create({
      data: { branchId: bA.id, teacherId: t1.id, groupId: null, kind: "base", year: YEAR, month: 1, expectedAmount: 1 },
    }),
    "unique",
  );

  await mustPass(
    "mart oyligi YANGI stavkada (3 000 000) - yanvar O'ZGARMAYDI",
    async () => {
      const mar = await salary.recalcBaseForTeacherMonth(t1.id, YEAR, 3);
      const jan = await prisma.teacherSalary.findFirst({
        where: { teacherId: t1.id, kind: "base", year: YEAR, month: 1 },
      });
      return { mar, jan };
    },
    ({ mar, jan }) => {
      if (mar?.expectedAmount !== 3_000_000) return `mart=${mar?.expectedAmount}`;
      if (jan?.expectedAmount !== 2_000_000) return `yanvar buzildi: ${jan?.expectedAmount}`;
      return null;
    },
  );

  await mustPass(
    "SEGMENT: fevral o'rtasida oshirilsa kunlar bo'yicha bo'linadi",
    async () => {
      // 28 kunlik fevral: 1-14 (14 kun) 1000/kun, 15-28 (14 kun) 2000/kun.
      const t = await mkTeacher("Segment", bA.id);
      await prisma.teacherCompensation.createMany({
        data: [
          { teacherId: t.id, branchId: bA.id, effectiveFrom: new Date(Date.UTC(YEAR, 1, 1)), effectiveTo: new Date(Date.UTC(YEAR, 1, 15)), baseType: "fixed_monthly", baseAmount: 2_800_000 },
          { teacherId: t.id, branchId: bA.id, effectiveFrom: new Date(Date.UTC(YEAR, 1, 15)), effectiveTo: null, baseType: "fixed_monthly", baseAmount: 5_600_000 },
        ],
      });
      const row = await salary.recalcBaseForTeacherMonth(t.id, YEAR, 2);
      return row;
    },
    (r) => {
      // 2 800 000*14/28 + 5 600 000*14/28 = 1 400 000 + 2 800 000 = 4 200 000
      if (r?.expectedAmount !== 4_200_000) return `expected=${r?.expectedAmount} (kutilgan 4200000)`;
      if (r?.payableDays !== 28) return `payableDays=${r?.payableDays}`;
      return null;
    },
  );

  await mustPass(
    "IKKI MARTA SANASH YO'Q: kesishgan stavkalarda kunlar takrorlanmaydi",
    async () => {
      const t = await mkTeacher("Kesish", bA.id);
      // Ataylab KESISHGAN ikki stavka - qo'riqchi (assertNoOverlap)
      // qo'yilishidan OLDIN yaratilgan buzuq ma'lumotni taqlid qiladi.
      //
      // IKKALASI HAM YOPIQ (effectiveTo bor): qisman unique indeks
      // `teacher_compensations_open_key` faqat `effectiveTo IS NULL`
      // qatorlarga tegishli, ya'ni ochiq davr bilan bunday holatni
      // BAZANING O'ZI to'sadi (bu ham tekshirilgan invariant). Yopiq
      // davrlarda esa kesishuv bazada mumkin - himoyaning ikkinchi
      // qatlami (claimedUntil klampi) aynan shu holat uchun.
      await prisma.teacherCompensation.createMany({
        data: [
          { teacherId: t.id, branchId: bA.id, effectiveFrom: new Date(Date.UTC(YEAR, 2, 1)), effectiveTo: new Date(Date.UTC(YEAR, 3, 1)), baseType: "fixed_monthly", baseAmount: 3_100_000 },
          { teacherId: t.id, branchId: bA.id, effectiveFrom: new Date(Date.UTC(YEAR, 2, 1)), effectiveTo: new Date(Date.UTC(YEAR, 3, 1)), baseType: "fixed_monthly", baseAmount: 3_100_000 },
        ],
      });
      const comps = await compensationsForRange(t.id, new Date(Date.UTC(YEAR, 2, 1)), new Date(Date.UTC(YEAR, 3, 1)));
      const segs = baseSegmentsForMonth(comps, YEAR, 3);
      const days = segs.reduce((s, seg) => s + Math.round((seg.endExcl - seg.start) / 86400000), 0);
      return { comps: comps.length, days };
    },
    (r) => {
      if (r.comps !== 2) return `${r.comps} ta stavka topilmadi`;
      if (r.days !== 31) return `${r.days} kun (31 kutilgan - kesishuv ikki marta sanaldi)`;
      return null;
    },
  );

  await mustPass(
    "ishga olingan sanadan OLDINGI oyda fiksa yo'q",
    async () => {
      const t = await mkTeacher("Kech", bA.id, new Date(Date.UTC(YEAR, 5, 1)));
      await prisma.teacherCompensation.create({
        data: { teacherId: t.id, branchId: bA.id, effectiveFrom: new Date(Date.UTC(YEAR, 5, 1)), baseType: "fixed_monthly", baseAmount: 1_000_000 },
      });
      return salary.recalcBaseForTeacherMonth(t.id, YEAR, 4);
    },
    (r) => (r === null ? null : `qator yaratildi: ${r?.expectedAmount}`),
  );

  // ── 3) ATOMIK TO'LOV / STATUS ────────────────────────────────────
  console.log("\n3) atomik to'lov va status");

  await mustPass(
    "applyPaidDelta status va overpaid ni JORIY paidAmount dan chiqaradi",
    async () => {
      const r1 = await salary.applyPaidDelta(janRow.id, 500_000);
      const r2 = await salary.applyPaidDelta(janRow.id, 1_500_000);
      const capped = await salary.applyPaidDelta(janRow.id, 1, { capToRemaining: true });
      return { r1, r2, capped };
    },
    ({ r1, r2, capped }) => {
      if (r1.status !== "partial") return `r1=${r1.status}`;
      if (r2.status !== "paid" || r2.paidAmount !== 2_000_000) return `r2=${r2.status}/${r2.paidAmount}`;
      if (capped !== null) return "cap qoldiqdan oshiqni to'smadi";
      return null;
    },
  );

  await mustPass(
    "TO'LANGAN oy stavka o'zgarishida QAYTA YOZILMAYDI (lockPaid)",
    async () => {
      const before = await prisma.teacherSalary.findUnique({ where: { id: janRow.id } });
      await salary.recalcBaseForTeacherMonth(t1.id, YEAR, 1, { lockPaid: true });
      const after = await prisma.teacherSalary.findUnique({ where: { id: janRow.id } });
      return { before, after };
    },
    ({ before, after }) =>
      before.expectedAmount === after.expectedAmount ? null : "to'langan oy o'zgardi",
  );

  await mustPass(
    "to'lovni qaytarib olish statusni tiklaydi",
    async () => salary.applyPaidDelta(janRow.id, -2_000_000),
    (r) => (r.paidAmount === 0 && r.status === "unpaid" ? null : `${r.paidAmount}/${r.status}`),
  );

  // ── 4) GURUH QATORI + FOIZ BAZASI ────────────────────────────────
  console.log("\n4) guruh qatori va foiz bazasi");

  await mustPass(
    "guruh narxi o'rnatiladi",
    () => inA(() => groupFee.upsert({ groupId: g1.id, year: YEAR, month: 4, amount: 1_000_000 }, { id: null })),
    (f) => (f?.amount === 1_000_000 && f.source === "manual" ? null : "narx yozilmadi"),
  );

  await mustPass(
    "GroupFee IDEMPOTENT (compound unique)",
    async () => {
      await inA(() => groupFee.ensureGroupFee(g1.id, YEAR, 4));
      return prisma.groupFee.count({ where: { groupId: g1.id, year: YEAR, month: 4 } });
    },
    (n) => (n === 1 ? null : `${n} ta narx qatori`),
  );

  await mustPass(
    "foizli o'qituvchi guruh tushumidan haq oladi",
    async () => {
      // 2 o'quvchi × 1 000 000 hisoblangan = 2 000 000 baza, 30% = 600 000
      for (let i = 0; i < 2; i += 1) {
        const st = await prisma.user.create({
          data: {
            firstName: `Talaba${i}`, lastName: "Foiz", username: `stp${i}_${S}`,
            passwordHash: "x", role: ROLES.STUDENT, homeBranchId: bA.id,
          },
        });
        created.users.push(st.id);
        await prisma.studentPayment.create({
          data: {
            branchId: bA.id, studentId: st.id, groupId: g1.id, year: YEAR, month: 4,
            baseFee: 1_000_000, expectedAmount: 1_000_000, paidAmount: 0, status: "unpaid",
          },
        });
      }
      await prisma.teacherCompensation.create({
        data: {
          teacherId: t2.id, branchId: bA.id,
          effectiveFrom: new Date(Date.UTC(YEAR, 0, 1)),
          baseType: "none", variableType: "percent", variableRate: 30, percentBase: "billed",
        },
      });
      await prisma.teacherGroupPeriod.create({
        data: { teacherId: t2.id, groupId: g1.id, startDate: new Date(Date.UTC(YEAR, 0, 1)) },
      });
      return salary.ensureSalaryForTeacherGroup(t2.id, g1.id, YEAR, 4);
    },
    (r) => {
      if (!r) return "qator yaratilmadi";
      if (r.expectedAmount !== 600_000) return `expected=${r.expectedAmount} (600000 kutilgan)`;
      if (r.groupRevenue !== 2_000_000) return `groupRevenue=${r.groupRevenue}`;
      if (r.rateSource !== "compensation") return `rateSource=${r.rateSource}`;
      return null;
    },
  );

  await mustPass(
    "ensureSalaryForTeacherGroup IDEMPOTENT",
    async () => {
      await salary.ensureSalaryForTeacherGroup(t2.id, g1.id, YEAR, 4);
      await salary.ensureSalaryForTeacherGroup(t2.id, g1.id, YEAR, 4);
      return prisma.teacherSalary.count({
        where: { teacherId: t2.id, groupId: g1.id, year: YEAR, month: 4, kind: "group" },
      });
    },
    (n) => (n === 1 ? null : `${n} ta qator`),
  );

  await mustPass(
    "guruh narxi oshsa maosh QAYTA HISOBLANADI (kaskad)",
    async () => {
      // Har o'quvchining plani 1.5 mln bo'ladi → baza 3 mln → 30% = 900 000
      await prisma.studentPayment.updateMany({
        where: { groupId: g1.id, year: YEAR, month: 4 },
        data: { expectedAmount: 1_500_000 },
      });
      await salary.recalcForGroupMonth(g1.id, YEAR, 4);
      return prisma.teacherSalary.findFirst({
        where: { teacherId: t2.id, groupId: g1.id, year: YEAR, month: 4, kind: "group" },
      });
    },
    (r) => (r?.expectedAmount === 900_000 ? null : `expected=${r?.expectedAmount}`),
  );

  await mustPass(
    "IKKINCHI GURUH alohida qator (fiksa oylik takrorlanmaydi)",
    async () => {
      await prisma.teacherGroupPeriod.create({
        data: { teacherId: t2.id, groupId: g2.id, startDate: new Date(Date.UTC(YEAR, 0, 1)) },
      });
      await salary.ensureSalaryForTeacherGroup(t2.id, g2.id, YEAR, 4);
      return prisma.teacherSalary.findMany({
        where: { teacherId: t2.id, year: YEAR, month: 4 },
        select: { kind: true, groupId: true },
      });
    },
    (rows) => {
      const groups = rows.filter((r) => r.kind === "group");
      if (groups.length !== 2) return `${groups.length} ta guruh qatori`;
      if (rows.filter((r) => r.kind === "base").length > 0) return "keraksiz base qatori";
      return null;
    },
  );

  await mustPass(
    "QULFLANGAN qator hech qanday holatda qayta yozilmaydi",
    async () => {
      const row = await prisma.teacherSalary.findFirst({
        where: { teacherId: t2.id, groupId: g1.id, year: YEAR, month: 4, kind: "group" },
      });
      await prisma.teacherSalary.update({ where: { id: row.id }, data: { isLocked: true, expectedAmount: 777 } });
      await salary.recalc(row.id, { force: true });
      return prisma.teacherSalary.findUnique({ where: { id: row.id } });
    },
    (r) => (r.expectedAmount === 777 ? null : `qulf buzildi: ${r.expectedAmount}`),
  );

  // ── 5) MAOSH TO'LOVI + JURNAL ────────────────────────────────────
  console.log("\n5) maosh to'lovi va qo'sh yozuv");

  const payRow = await prisma.teacherSalary.findFirst({
    where: { teacherId: t1.id, kind: "base", year: YEAR, month: 3 },
  });

  await mustPass(
    "maosh to'lovi yoziladi va jurnal muvozanatda",
    async () => {
      const trx = await inA(() => salaryTxn.create(
        { salaryId: payRow.id, amount: 1_000_000, method: "cash", note: "test" },
        { id: null, permissions: ["*"] },
      ));
      const fresh = await prisma.teacherSalary.findUnique({ where: { id: payRow.id } });
      const entry = await prisma.journalEntry.findFirst({
        where: { refId: trx.id, refModel: "SalaryTransaction" },
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
      if (entry.lines.length !== 2) return `${entry.lines.length} qator`;
      return null;
    },
  );

  await mustThrow(
    "qoldiqdan ORTIQ to'lov rad etiladi",
    () => inA(() => salaryTxn.create(
      { salaryId: payRow.id, amount: 99_000_000, method: "cash" },
      { id: null, permissions: ["*"] },
    )),
    "qoldiqdan oshib",
  );

  await mustPass(
    "to'lovni bekor qilish balansni qaytaradi",
    async () => {
      const trx = await prisma.salaryTransaction.findFirst({
        where: { salaryId: payRow.id, isDeleted: false },
      });
      await inA(() => salaryTxn.remove(trx.id, { id: null }));
      return prisma.teacherSalary.findUnique({ where: { id: payRow.id } });
    },
    (r) => (r.paidAmount === 0 && r.status === "unpaid" ? null : `${r.paidAmount}/${r.status}`),
  );

  await mustThrow(
    "nomuvozanat jurnal yozuvi RAD ETILADI",
    () => journal.post({
      branchId: bA.id, kind: "adjustment", memo: "buzuq",
      lines: [{ accountKind: "cash", debit: 100 }, { accountKind: "revenue", credit: 50 }],
    }),
    "muvozanat",
  );

  await mustThrow(
    "bir qatorda ham debet ham kredit RAD ETILADI",
    () => journal.post({
      branchId: bA.id, kind: "adjustment", memo: "ikki tomon",
      lines: [{ accountKind: "cash", debit: 100, credit: 100 }, { accountKind: "revenue", credit: 100, debit: 100 }],
    }),
    "bir vaqtda",
  );

  // ── 6) MUKOFOT / JARIMA ──────────────────────────────────────────
  console.log("\n6) mukofot va jarima");

  await mustPass(
    "jarima MANFIY expectedAmount bilan saqlanadi",
    () => inA(() => adjustment.create(
      { teacher: t1.id, kind: "deduction", amount: 300_000, year: YEAR, month: 5, reason: "test jarima", branchId: bA.id },
      { id: null },
    )),
    (r) => (r?.expectedAmount === -300_000 ? null : `expected=${r?.expectedAmount}`),
  );

  await mustPass(
    "mukofot/jarima recalc bilan NOLGA TUSHMAYDI",
    async () => {
      const row = await prisma.teacherSalary.findFirst({
        where: { teacherId: t1.id, kind: "deduction", year: YEAR, month: 5 },
      });
      await salary.recalc(row.id);
      return prisma.teacherSalary.findUnique({ where: { id: row.id } });
    },
    (r) => (r.expectedAmount === -300_000 ? null : `expected=${r.expectedAmount}`),
  );

  // ── 7) FILIAL IZOLYATSIYASI ──────────────────────────────────────
  console.log("\n7) filial izolyatsiyasi");

  await prisma.teacherSalary.create({
    data: { branchId: bB.id, teacherId: tB.id, kind: "base", year: YEAR, month: 1, expectedAmount: 5_000_000 },
  });

  await mustPass(
    "A filial ro'yxatida B filial maoshi YO'Q",
    () => inA(() => salary.list({ year: YEAR, limit: 500 })),
    (r) => (r.items.some((s) => s.teacherId === tB.id) ? "B filial maoshi sizib chiqdi" : null),
  );

  await mustPass(
    "obligations ham filial bo'yicha kesiladi",
    () => inA(() => salary.obligations({ year: YEAR })),
    (rows) => (rows.some((s) => s.teacherId === tB.id) ? "B filial qarzi sizib chiqdi" : null),
  );

  await mustThrow(
    "A kontekstida B filial o'qituvchisining balansi ochilmaydi",
    () => inA(() => salary.balanceByTeacher(tB.id)),
    "topilmadi",
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
