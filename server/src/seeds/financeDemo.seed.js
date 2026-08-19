import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";
import * as financialTx from "../modules/finance/services/financialTransaction.service.js";
import * as budgetSvc from "../modules/financeOps/services/budget.service.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";

/**
 * MOLIYA DEMO MA'LUMOTI — brauzer QA va qo'lda sinov uchun.
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU SOXTA RAQAM EMAS
 *
 * Har bir summa HAQIQIY moliyaviy servislar orqali o'tadi:
 * `postStudentPayment`, `postExpense`, `postTeacherPayroll`,
 * `postRefund`, `postOwnerInvestment`, `postTransfer`. Ya'ni jurnal
 * yozuvlari, o'lchovlar, audit izi va idempotentlik — hammasi
 * ishlab chiqarish yo'lidagidek hosil bo'ladi.
 *
 * Muqobil — UI ga qo'lda raqam yozib qo'yish — tekshiruvni
 * MA'NOSIZ qilardi: ekranda ko'ringan narsa hech qanday hisobdan
 * kelib chiqmagan bo'lardi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * TOZALASH: barcha yozuv `DEMO` prefiksi bilan belgilanadi.
 *   npm run seed:finance-demo -- --clean
 *
 * ISHLATISH:
 *   npm run seed:finance-demo
 */
const TAG = "DEMO";
const isClean = process.argv.includes("--clean");

const clean = async () => {
  const branches = await prisma.branch.findMany({
    where: { name: { startsWith: TAG } }, select: { id: true },
  });
  const ids = branches.map((b) => b.id);
  if (!ids.length) { logger.info("Demo ma'lumot topilmadi"); return; }

  const entries = await prisma.journalEntry.findMany({ where: { branchId: { in: ids } }, select: { id: true } });
  await prisma.journalLine.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
  await prisma.journalEntry.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.financialAuditLog.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.budgetLine.deleteMany({ where: { budget: { branchId: { in: ids } } } });
  await prisma.budget.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.refund.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.salaryTransaction.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.teacherSalary.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.paymentTransaction.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.studentPayment.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.expense.deleteMany({ where: { branchId: { in: ids } } });

  const groups = await prisma.group.findMany({ where: { branchId: { in: ids } }, select: { id: true } });
  const gids = groups.map((g) => g.id);
  await prisma.groupFee.deleteMany({ where: { groupId: { in: gids } } });
  await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: gids } } });
  await prisma.groupMembership.deleteMany({ where: { groupId: { in: gids } } });
  await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: gids } } });
  await prisma.group.deleteMany({ where: { id: { in: gids } } });

  await prisma.journalLine.deleteMany({ where: { account: { branchId: { in: ids } } } });
  await prisma.account.deleteMany({ where: { branchId: { in: ids } } });
  await prisma.room.deleteMany({ where: { branchId: { in: ids } } });
  // Depozit zanjiri foydalanuvchidan OLDIN o'chadi (FK tartibi).
  const demoUsers = await prisma.user.findMany({
    where: { username: { startsWith: "demo_" } }, select: { id: true },
  });
  const uids = demoUsers.map((u) => u.id);
  await prisma.depositTransaction.deleteMany({ where: { studentId: { in: uids } } });
  await prisma.studentDeposit.deleteMany({ where: { studentId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.expenseCategory.deleteMany({ where: { code: { startsWith: "demo_" } } });
  await prisma.course.deleteMany({ where: { code: { startsWith: "demo_" } } });
  await prisma.branch.deleteMany({ where: { id: { in: ids } } });
  logger.info({ branches: ids.length }, "Demo ma'lumot o'chirildi");
};

const seed = async () => {
  await connectDB();
  if (isClean) { await clean(); await disconnectDB(); return; }

  const exists = await prisma.branch.findFirst({ where: { name: { startsWith: TAG } } });
  if (exists) {
    logger.warn("Demo ma'lumot allaqachon bor. Avval: npm run seed:finance-demo -- --clean");
    await disconnectDB();
    return;
  }

  const owner = await prisma.user.findFirst({ where: { role: "owner" } });
  if (!owner) { logger.error("Owner topilmadi — avval npm run seed:owner"); await disconnectDB(); return; }

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;
  const day = (d, back = 0) => new Date(Date.UTC(Y, M - 1 - back, d, 12));
  const ym = (back = 0) => {
    const x = new Date(Date.UTC(Y, M - 1 - back, 1));
    return { year: x.getUTCFullYear(), month: x.getUTCMonth() + 1 };
  };

  const branch = await prisma.branch.create({ data: { name: `${TAG} Markaz`, code: "DEMO1" } });
  const mkUser = async (first, role, i) => prisma.user.create({
    data: {
      firstName: first, lastName: "Demo", username: `demo_${role}_${i}`,
      passwordHash: "x", role, homeBranchId: branch.id, hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });

  const t1 = await mkUser("Aziz", "teacher", 1);
  const t2 = await mkUser("Malika", "teacher", 2);
  const t3 = await mkUser("Bobur", "teacher", 3);
  const students = [];
  for (let i = 1; i <= 12; i += 1) students.push(await mkUser(`Talaba${i}`, "student", i));

  const ielts = await prisma.course.create({ data: { title: "IELTS", code: "demo_ielts" } });
  const general = await prisma.course.create({ data: { title: "General English", code: "demo_general" } });
  const kids = await prisma.course.create({ data: { title: "Kids English", code: "demo_kids" } });

  const r101 = await prisma.room.create({ data: { branchId: branch.id, name: "101-xona", capacity: 14 } });
  const r102 = await prisma.room.create({ data: { branchId: branch.id, name: "102-xona", capacity: 12 } });
  const r104 = await prisma.room.create({ data: { branchId: branch.id, name: "104-xona", capacity: 10 } });

  const mkGroup = async (name, course, room, teachers, hoursPerWeek) => {
    const g = await prisma.group.create({
      data: { branchId: branch.id, name, courseId: course.id, roomId: room.id, isActive: true },
    });
    const slots = hoursPerWeek / 2;
    const days = ["mon", "tue", "wed", "thu", "fri"];
    await prisma.groupScheduleItem.createMany({
      data: Array.from({ length: slots }, (_, i) => ({
        groupId: g.id, day: days[i % 5], startTime: "09:00", endTime: "11:00",
      })),
    });
    for (const t of teachers) {
      await prisma.teacherGroupPeriod.create({
        data: { teacherId: t.id, groupId: g.id, startDate: new Date(Date.UTC(Y - 1, 0, 1)) },
      });
    }
    return g;
  };

  // G3 da IKKI o'qituvchi — atributsiya ATAYLAB noaniq (qamrov < 100%).
  const g1 = await mkGroup("IELTS-A", ielts, r101, [t1], 6);
  const g2 = await mkGroup("General-B", general, r102, [t1], 4);
  const g3 = await mkGroup("IELTS-C", ielts, r101, [t2, t3], 4);
  const g4 = await mkGroup("Kids-D", kids, r104, [t2], 2);

  const assign = async (group, list) => {
    for (const s of list) {
      await prisma.groupMembership.create({
        data: { groupId: group.id, studentId: s.id, joinedAt: new Date(Date.UTC(Y, M - 4, 1)) },
      });
    }
  };
  await assign(g1, students.slice(0, 4));
  await assign(g2, students.slice(4, 7));
  await assign(g3, students.slice(7, 10));
  await assign(g4, students.slice(10, 12));

  const ctx = { branchId: branch.id, allowedBranchIds: [branch.id], canSeeAllBranches: true, userId: owner.id };
  const inBr = (fn) => runWithBranchContext(ctx, fn);

  const FEE = { [g1.id]: 800_000, [g2.id]: 600_000, [g3.id]: 800_000, [g4.id]: 400_000 };

  // ── GURUH NARXI (GroupFee) — MAJBURIY ──
  //
  // Oylik plan `expectedAmount` ni tizim GURUH NARXIDAN qayta
  // hisoblaydi (`studentPayment.service.js` → recalc, proratsiya
  // bilan). Narx belgilanmagan bo'lsa qayta hisob NOLGA olib keladi.
  //
  // Bu aynan shu seedni yozganda ko'rindi: joriy oy planlari
  // fon jarayoni tomonidan qayta hisoblanib 0 ga tushdi, o'tgan oy
  // esa tegilmagani uchun joyida qoldi. Ya'ni narxsiz plan yaratish
  // "ishlayotgandek" ko'rinadi, keyin jimgina nolga aylanadi.
  for (const back of [1, 0]) {
    const p = ym(back);
    for (const g of [g1, g2, g3, g4]) {
      await prisma.groupFee.create({
        data: { groupId: g.id, year: p.year, month: p.month, amount: FEE[g.id], source: "manual" },
      });
    }
  }
  const membersOf = async (g) =>
    prisma.groupMembership.findMany({ where: { groupId: g.id }, select: { studentId: true, id: true } });

  let payments = 0;
  // Ikki oy: o'tgan oy va joriy oy — taqqoslash ishlashi uchun.
  for (const back of [1, 0]) {
    const p = ym(back);
    for (const g of [g1, g2, g3, g4]) {
      const members = await membersOf(g);
      for (const [i, m] of members.entries()) {
        const base = FEE[g.id];
        // Har uchinchi o'quvchida chegirma — chegirma tahlili bo'sh qolmasin.
        const discount = i % 3 === 0 ? 100_000 : 0;
        const plan = await prisma.studentPayment.create({
          data: {
            branchId: branch.id, studentId: m.studentId, groupId: g.id, membershipId: m.id,
            year: p.year, month: p.month, baseFee: base,
            discountApplied: discount, expectedAmount: base - discount, paidAmount: 0,
          },
        });
        // Har to'rtinchi o'quvchi TO'LAMAYDI — qarzdorlik hosil bo'lsin.
        if (i % 4 === 3) continue;
        // Har beshinchisi QISMAN to'laydi.
        const amount = i % 5 === 4 ? Math.round((base - discount) / 2) : base - discount;
        const method = ["cash", "click", "payme", "card"][i % 4];
        const fee = method === "payme" ? Math.round(amount * 0.01) : 0;

        const trx = await prisma.paymentTransaction.create({
          data: {
            branchId: branch.id, paymentId: plan.id, studentId: m.studentId, groupId: g.id,
            year: p.year, month: p.month, amount, feeAmount: fee,
            provider: method === "payme" ? "Payme" : "",
            source: "direct", method, paidAt: day(5 + i, back),
          },
        });
        await prisma.studentPayment.update({ where: { id: plan.id }, data: { paidAmount: amount } });
        await inBr(() => financialTx.postStudentPayment({ paymentTransactionId: trx.id }, owner));
        payments += 1;
      }
    }
  }

  // ── CHIQIMLAR ──
  // ── KATEGORIYALAR: MAVJUDLARI QAYTA ISHLATILADI ──
  //
  // `seed:expense-categories` allaqachon standart kategoriyalarni
  // yaratadi ("Ijara", "Reklama va marketing"...). Ularni takrorlash
  // (branchId, name) qisman unique indeksiga urilardi — va bu TO'G'RI
  // to'siq: bir filialda ikkita "Ijara" bo'lsa, chiqim hisoboti
  // ikkiga bo'linib ketardi.
  //
  // Shuning uchun kod bo'yicha topamiz; topilmasa DEMO nomi bilan
  // yaratamiz (standart seed yurgizilmagan bo'lishi mumkin).
  const findOrCreateCat = async (code, demoName, kind, costType) => {
    const found = await prisma.expenseCategory.findFirst({
      where: { code, branchId: null, isDeleted: false },
    });
    if (found) {
      // `costType` STEP 3 da qo'shilgan — eski kategoriyalarda u
      // standart qiymatda turibdi. Demo uchun aniqlashtiramiz.
      if (found.costType !== costType) {
        return prisma.expenseCategory.update({ where: { id: found.id }, data: { costType } });
      }
      return found;
    }
    return prisma.expenseCategory.create({
      data: { name: demoName, code: `demo_${code}`, kind, costType },
    });
  };

  const cats = {
    demo_rent: await findOrCreateCat("rent", "DEMO Ijara", "operating", "fixed"),
    demo_marketing: await findOrCreateCat("marketing", "DEMO Marketing", "operating", "variable"),
    demo_utilities: await findOrCreateCat("utilities", "DEMO Kommunal", "operating", "fixed"),
    demo_internet: await findOrCreateCat("internet", "DEMO Internet", "operating", "fixed"),
  };
  const mkExpense = async (cat, title, amount, method, back) => {
    const p = ym(back);
    const e = await prisma.expense.create({
      data: {
        branchId: branch.id, categoryId: cat.id, categoryName: cat.name, categoryKind: cat.kind,
        title, amount, spentAt: day(3, back), accrualYear: p.year, accrualMonth: p.month, method,
        vendor: title,
      },
    });
    await inBr(() => financialTx.postExpense({ expenseId: e.id }, owner));
  };
  for (const back of [1, 0]) {
    await mkExpense(cats.demo_rent, "Ijara", 8_000_000, "bank", back);
    await mkExpense(cats.demo_utilities, "Kommunal", 1_200_000, "cash", back);
    await mkExpense(cats.demo_internet, "Internet", 400_000, "bank", back);
    // Marketing joriy oyda KESKIN oshadi — ogohlantirish chiqishi uchun.
    await mkExpense(cats.demo_marketing, "Reklama", back === 0 ? 7_200_000 : 5_000_000, "cash", back);
  }

  // ── MAOSH ──
  for (const back of [1, 0]) {
    const p = ym(back);
    for (const [teacher, group, amount] of [
      // Maosh guruh tushumining ~35% i — real markazga yaqin nisbat.
      // (Ilgari bu raqamlar tushumdan katta edi va butun demo
      // zarar ko'rsatardi — tekshirish uchun foydasiz manzara.)
      [t1, g1, 1_000_000], [t1, g2, 600_000], [t2, g3, 800_000], [t2, g4, 300_000],
    ]) {
      const sal = await prisma.teacherSalary.create({
        data: {
          branchId: branch.id, teacherId: teacher.id, groupId: group.id,
          year: p.year, month: p.month, expectedAmount: amount, paidAmount: amount,
        },
      });
      const stx = await prisma.salaryTransaction.create({
        data: {
          branchId: branch.id, salaryId: sal.id, teacherId: teacher.id, groupId: group.id,
          year: p.year, month: p.month, amount, method: "cash", paidAt: day(28, back),
        },
      });
      await inBr(() => financialTx.postTeacherPayroll({ salaryTransactionId: stx.id }, owner));
    }
  }

  // ── QAYTARIM ──
  const someTx = await prisma.paymentTransaction.findFirst({
    where: { branchId: branch.id, isDeleted: false }, orderBy: { paidAt: "desc" },
  });
  if (someTx) {
    const rf = await prisma.refund.create({
      data: {
        branchId: branch.id, studentId: someTx.studentId, groupId: someTx.groupId,
        originalTransactionId: someTx.id, amount: 200_000, method: "cash",
        reason: "Kursni tark etdi", requestedById: owner.id, createdById: owner.id,
        approvedById: owner.id, approvedAt: new Date(), executedAt: day(20),
      },
    });
    await inBr(() => financialTx.postRefund({ refundId: rf.id }, owner));
  }

  // ── EGASINING PULI VA ICHKI O'TKAZMA ──
  await inBr(() => financialTx.postOwnerInvestment(
    { branchId: branch.id, amount: 20_000_000, method: "bank", reference: "demo-inv-1", date: day(2), ownerId: owner.id }, owner));
  await inBr(() => financialTx.postOwnerWithdrawal(
    { branchId: branch.id, amount: 5_000_000, method: "cash", reference: "demo-wdr-1", date: day(25), ownerId: owner.id }, owner));
  await inBr(() => financialTx.postTransfer(
    { branchId: branch.id, fromMethod: "bank", toMethod: "cash", amount: 3_000_000, reference: "demo-tr-1", date: day(15) }, owner));

  // ── BYUDJET (joriy oy) ──
  const cur = ym(0);
  await inBr(() => budgetSvc.createBudget({
    name: `${TAG} byudjet`, branchId: branch.id, periodType: "month",
    year: cur.year, month: cur.month, status: "active",
    lines: [
      { scope: "total", amount: 30_000_000 },
      { scope: "category", categoryId: cats.demo_rent.id, amount: 8_000_000 },
      // Marketing byudjetdan OSHIB ketadi (5M reja, 7.2M fakt) —
      // "byudjetdan oshish" ogohlantirishi chiqadi.
      { scope: "category", categoryId: cats.demo_marketing.id, amount: 5_000_000 },
      { scope: "kind", categoryKind: "payroll", amount: 10_000_000 },
    ],
  }, owner));

  logger.info({ branch: branch.name, payments, groups: 4, students: 12 }, "Moliya demo ma'lumoti tayyor");
  await disconnectDB();
};

seed().catch(async (err) => {
  // Prisma xatosi `logger` ichida ko'milib qoladi — sababi ko'rinsin.
  console.error("\nDEMO SEED XATOSI:", err?.message || err);
  if (err?.meta) console.error("meta:", JSON.stringify(err.meta));
  logger.error({ err: err?.message }, "Demo seed xatosi");
  await disconnectDB();
  process.exit(1);
});
