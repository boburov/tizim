/**
 * GURUH YOZISH YO'LLARI + MOLIYAVIY YON TA'SIRLAR — Prisma ustida.
 *
 * BU TESTNING MAQSADI - foydalanuvchi qo'ygan KRITIK QOIDANI tekshirish:
 *
 *     Guruh o'zgarishi → maosh qayta hisobi → moliyaviy yon ta'sir
 *
 * ya'ni muvaffaqiyatli javob HAQIQATAN barcha invariantlar bajarilganini
 * anglatishi kerak. Shuning uchun har bir yozish amalidan keyin
 * NATIJANING O'ZI emas, BAZADAGI hosila yozuvlar tekshiriladi:
 * TeacherGroupPeriod, TeacherSalary, GroupFee, StudentPayment.
 *
 * Ko'chirishda jimgina buzilishi mumkin bo'lgan joylar:
 *   1) `Group.teachers` — ko'p-ko'pga bog'lanish. `.map(String)` obyektlar
 *      ustida "[object Object]" berardi va to'qnashuv tekshiruvi
 *      hech nimani tutmasdi.
 *   2) `Group.schedule` — alohida jadval. `include` unutilsa dars soni 0
 *      bo'lib, soatbay maosh va o'quvchi qarzi jimgina nolga tushardi.
 *   3) `archivedClosedPeriods` — SKALYAR String[]. `doc._id` yozilsa
 *      massiv `undefined` bilan to'lib, kursni qayta ochganda hech narsa
 *      tiklanmasdi.
 *   4) `runFinanceTxn` — endi haqiqiy tranzaksiya: guruhni o'chirishda
 *      depozit qaytarilib, guruh o'chmay qolishi mumkin emas.
 *
 * ISHLATISH:  npm run test:groups-chain
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as groups from "../src/modules/groups/services/groups.service.js";
import * as tgp from "../src/modules/groups/services/teacherGroupPeriod.service.js";
import * as groupFee from "../src/modules/finance/services/groupFee.service.js";
import * as payments from "../src/modules/finance/services/studentPayment.service.js";
import * as txn from "../src/modules/finance/services/transaction.service.js";
import * as deposits from "../src/modules/deposits/services/deposit.service.js";
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

const S = `g${Date.now().toString(36)}`;
const created = { users: [], groups: [], branches: [] };

const cleanup = async () => {
  const { users, groups: gs, branches } = created;
  const gids = [...new Set(gs)];
  const uids = [...new Set(users)];
  if (uids.length || gids.length) {
    const scope = { OR: [{ studentId: { in: uids } }, { groupId: { in: gids } }] };
    await prisma.paymentTransaction.deleteMany({ where: scope });
    await prisma.studentPayment.deleteMany({ where: scope });
    await prisma.debtWriteOffBreakdown.deleteMany({
      where: { writeOff: { OR: [{ studentId: { in: uids } }, { groupId: { in: gids } }] } },
    });
    await prisma.debtWriteOff.deleteMany({ where: scope });
    await prisma.depositTransaction.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.studentDeposit.deleteMany({ where: { studentId: { in: uids } } });
    await prisma.salaryTransaction.deleteMany({
      where: { OR: [{ teacherId: { in: uids } }, { groupId: { in: gids } }] },
    });
    await prisma.teacherSalary.deleteMany({
      where: { OR: [{ teacherId: { in: uids } }, { groupId: { in: gids } }] },
    });
    await prisma.teacherGroupPeriod.deleteMany({
      where: { OR: [{ teacherId: { in: uids } }, { groupId: { in: gids } }] },
    });
    await prisma.teacherCompensation.deleteMany({ where: { teacherId: { in: uids } } });
    await prisma.groupMembership.deleteMany({ where: scope });
  }
  if (gids.length) {
    await prisma.groupFee.deleteMany({ where: { groupId: { in: gids } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: gids } } });
    for (const g of gids) {
      await prisma.group.update({ where: { id: g }, data: { teachers: { set: [] } } }).catch(() => {});
    }
    await prisma.group.deleteMany({ where: { id: { in: gids } } });
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

const mkTeacher = async (name, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "Guruh",
      username: `${name.toLowerCase()}_${S}`, passwordHash: "x",
      role: ROLES.TEACHER, homeBranchId: branchId,
      hiredAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  created.users.push(u.id);
  return u;
};

const mkStudent = async (name, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name, lastName: "Talaba",
      username: `${name.toLowerCase()}_${S}`, passwordHash: "x",
      role: ROLES.STUDENT, homeBranchId: branchId,
      enrolledAt: new Date(Date.UTC(2024, 0, 1)),
    },
  });
  created.users.push(u.id);
  return u;
};

const run = async () => {
  console.log("\n=== GURUH ZANJIRI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const bA = await prisma.branch.create({ data: { name: `Guruh A ${S}` } });
  const bB = await prisma.branch.create({ data: { name: `Guruh B ${S}` } });
  created.branches.push(bA.id, bB.id);

  const t1 = await mkTeacher("Birinchi", bA.id);
  const t2 = await mkTeacher("Ikkinchi", bA.id);
  const s1 = await mkStudent("Ali", bA.id);
  const s2 = await mkStudent("Vali", bA.id);

  // Har ikkala o'qituvchiga foizli standart stavka - maosh hosil bo'lsin.
  for (const t of [t1, t2]) {
    await prisma.teacherCompensation.create({
      data: {
        teacherId: t.id, branchId: bA.id,
        effectiveFrom: new Date(Date.UTC(2024, 0, 1)),
        baseType: "none", variableType: "percent", variableRate: 40, percentBase: "billed",
      },
    });
  }

  const scopeA = { branchId: bA.id, allowedBranchIds: [bA.id], canSeeAllBranches: false, userId: null };
  const scopeB = { branchId: bB.id, allowedBranchIds: [bB.id], canSeeAllBranches: false, userId: null };
  const inA = (fn) => runWithBranchContext(scopeA, fn);
  const inB = (fn) => runWithBranchContext(scopeB, fn);

  const MON = [{ day: "mon", startTime: "09:00", endTime: "10:30" }];

  // ── 1) YARATISH ──────────────────────────────────────────────────
  console.log("1) guruh yaratish + yon ta'sirlar");

  const g1 = await mustPass(
    "guruh yaratiladi (jadval, narx, o'qituvchi davri, maosh)",
    () => inA(() => groups.create(
      {
        name: `Alpha ${S}`,
        schedule: MON,
        teachers: [t1.id],
        startDate: new Date(Date.UTC(2025, 0, 1)),
        monthlyPrice: 1_000_000,
      },
      { id: null },
    )),
    (g) => {
      if (!g?.id) return "guruh qaytmadi";
      if (!g._id) return "_id taxallusi yo'q";
      if ((g.schedule || []).length !== 1) return `jadval ${g.schedule?.length} qator`;
      if ((g.teachers || []).length !== 1) return `teachers keshi ${g.teachers?.length}`;
      if (g.teachers[0].id !== t1.id) return "noto'g'ri o'qituvchi";
      return null;
    },
  );
  if (g1?.id) created.groups.push(g1.id);

  await mustPass(
    "O'QITUVCHI DAVRI ochildi (maoshning manbasi)",
    () => prisma.teacherGroupPeriod.findMany({
      where: { groupId: g1.id, teacherId: t1.id, isDeleted: false },
    }),
    (rows) => {
      if (rows.length !== 1) return `${rows.length} ta davr`;
      if (rows[0].endDate !== null) return "davr ochiq emas";
      return null;
    },
  );

  await mustPass(
    "GURUH NARXI yozildi (manual, berilgan summa bilan)",
    () => prisma.groupFee.findMany({ where: { groupId: g1.id } }),
    (rows) => {
      if (rows.length !== 1) return `${rows.length} ta narx`;
      if (rows[0].amount !== 1_000_000) return `amount=${rows[0].amount}`;
      if (rows[0].source !== "manual") return `source=${rows[0].source}`;
      return null;
    },
  );

  await mustPass(
    "MAOSH QATORLARI yaratildi - guruh boshidan BUGUNGACHA har oyga bittadan",
    async () => {
      const rows = await prisma.teacherSalary.findMany({
        where: { groupId: g1.id, teacherId: t1.id, kind: "group" },
        select: { year: true, month: true },
      });
      return rows;
    },
    (rows) => {
      if (!rows.length) return "maosh qatori umuman yaratilmadi";
      // Dublikat bo'lmasligi SHART (qisman unique indeks buni kafolatlaydi).
      const keys = rows.map((r) => `${r.year}-${r.month}`);
      if (new Set(keys).size !== keys.length) return "bir oyda ikkita qator (dublikat!)";
      // Guruh 2025-01 da boshlangan - o'sha oy albatta bo'lishi kerak.
      if (!keys.includes("2025-1")) return `2025-01 qatori yo'q: ${keys.join(",")}`;
      return null;
    },
  );

  await mustThrow(
    "JADVAL TO'QNASHUVI: o'qituvchi bir vaqtda ikki guruhda bo'la olmaydi",
    () => inA(() => groups.create(
      { name: `Beta ${S}`, schedule: MON, teachers: [t1.id], startDate: new Date(Date.UTC(2025, 0, 1)) },
      { id: null },
    )),
    "bu vaqtda darsi bor",
  );

  await mustPass(
    "to'qnashuvda guruh QOLDIRILMAYDI (rollback)",
    () => prisma.group.count({ where: { name: `Beta ${S}` } }),
    (n) => (n === 0 ? null : "yiqilgan guruh bazada qoldi"),
  );

  // ── 2) O'QUVCHI QO'SHISH ─────────────────────────────────────────
  console.log("\n2) o'quvchi qo'shish va qarz");

  await mustPass(
    "o'quvchi qo'shiladi va OYLIK PLAN yaratiladi",
    async () => {
      const m = await inA(() => groups.addStudent(g1.id, s1.id, {
        joinedAt: new Date(Date.UTC(2025, 0, 1)),
      }));
      const plans = await prisma.studentPayment.findMany({
        where: { studentId: s1.id, groupId: g1.id },
      });
      return { m, plans };
    },
    ({ m, plans }) => {
      if (!m?.id) return "a'zolik qaytmadi";
      if (!plans.length) return "oylik plan yaratilmadi";
      if (plans.every((p) => p.expectedAmount === 0)) return "barcha planlar 0 (jadval yuklanmagan?)";
      return null;
    },
  );

  await mustThrow(
    "bir o'quvchi ikki marta qo'shilmaydi",
    () => inA(() => groups.addStudent(g1.id, s1.id, {})),
    "allaqachon",
  );

  await mustThrow(
    "guruh boshlanishidan OLDIN qo'shib bo'lmaydi",
    () => inA(() => groups.addStudent(g1.id, s2.id, {
      joinedAt: new Date(Date.UTC(2024, 5, 1)),
    })),
    "oldin qo'shib bo'lmaydi",
  );

  await mustPass(
    "ikkinchi o'quvchi qo'shiladi → MAOSH QAYTA HISOBI ISHGA TUSHADI",
    async () => {
      // KASKAD BAJARILGANINI `recalculatedAt` bilan tekshiramiz - summa
      // emas. Sababi pastdagi testda: `assignTeacher` orqali ochilgan davr
      // o'qituvchini shu guruhda 0 stavkaga qulflaydi (MAVJUD xatti-harakat),
      // shuning uchun summaning o'zi o'zgarmaydi. Bizga muhimi - yon ta'sir
      // JIMGINA tashlab ketilmagani.
      const where = { groupId: g1.id, teacherId: t1.id, kind: "group", year: 2025, month: 1 };
      const before = await prisma.teacherSalary.findFirst({ where });
      await new Promise((r) => setTimeout(r, 5));
      await inA(() => groups.addStudent(g1.id, s2.id, {
        joinedAt: new Date(Date.UTC(2025, 0, 1)),
      }));
      const after = await prisma.teacherSalary.findFirst({ where });
      const plans = await prisma.studentPayment.aggregate({
        where: { groupId: g1.id, year: 2025, month: 1 },
        _sum: { expectedAmount: true },
        _count: { _all: true },
      });
      return { before, after, plans };
    },
    ({ before, after, plans }) => {
      if (!after) return "maosh qatori yo'qoldi";
      if (plans._count._all !== 2) return `${plans._count._all} ta oylik plan (2 kutilgan)`;
      if (!plans._sum.expectedAmount) return "o'quvchi qarzi hisoblanmadi";
      const t0 = new Date(before.recalculatedAt || 0).getTime();
      const t1x = new Date(after.recalculatedAt || 0).getTime();
      if (!(t1x > t0)) return "maosh qayta hisobi UMUMAN chaqirilmadi (recalculatedAt o'zgarmadi)";
      return null;
    },
  );

  // ── MAVJUD XATTI-HARAKAT (migratsiya regressiyasi EMAS) ──
  //
  // `assignTeacher` → `create()` ni `inheritStandardRate` BERMASDAN
  // chaqiradi, `normalizeRate()` esa stavka berilmasa ham
  // `salaryType:"fixed", fixedAmount:0` yozadi. `rateResolver.hasOwnRate()`
  // buni USTUNLIK deb biladi va o'qituvchining STANDART shartnomasi
  // (40% foiz) umuman qaralmaydi - natijada guruh maoshi 0 bo'ladi.
  //
  // Bu Mongo davridan beri shunday (git 9fb01b7 da ham `assignTeacher`
  // bayroqni bermaydi). Migratsiyada u ATAYLAB o'zgartirilmadi: tuzatish
  // o'qituvchilarning HAQIQIY maoshini 0 dan real summaga ko'taradi, ya'ni
  // bu MOLIYAVIY QAROR - alohida e'lon qilinishi kerak.
  //
  // Test uni "kutilgan" deb emas, KO'RINADIGAN qilib qayd etadi.
  await mustPass(
    "[MAVJUD XATO] assignTeacher davri standart stavkani BOSIB KETADI (rateSource=period_legacy, maosh 0)",
    () => prisma.teacherSalary.findFirst({
      where: { groupId: g1.id, teacherId: t1.id, kind: "group", year: 2025, month: 1 },
      select: { rateSource: true, expectedAmount: true },
    }),
    (r) => {
      if (r.rateSource === "compensation" && r.expectedAmount > 0) {
        return "XATI TUZATILGAN - bu testni yangilang va o'zgarishni e'lon qiling";
      }
      if (r.rateSource !== "period_legacy") return `kutilmagan rateSource=${r.rateSource}`;
      if (r.expectedAmount !== 0) return `kutilmagan summa=${r.expectedAmount}`;
      return null;
    },
  );

  // ── 3) TAHRIRLASH ────────────────────────────────────────────────
  console.log("\n3) guruh tahrirlash");

  await mustPass(
    "jadval versiyalanadi (eski qatorlar TARIX uchun saqlanadi)",
    async () => {
      await inA(() => groups.update(g1.id, {
        schedule: [{ day: "tue", startTime: "14:00", endTime: "15:30" }],
        scheduleEffectiveFrom: new Date(Date.UTC(2025, 5, 1)),
      }));
      return prisma.groupScheduleItem.findMany({ where: { groupId: g1.id } });
    },
    (rows) => {
      if (rows.length !== 2) return `${rows.length} ta slot (2 kutilgan: eski + yangi)`;
      const old = rows.find((r) => r.day === "mon");
      const neu = rows.find((r) => r.day === "tue");
      if (!old || old.effectiveFrom !== null) return "eski versiya saqlanmadi";
      if (!neu?.effectiveFrom) return "yangi versiyada effectiveFrom yo'q";
      return null;
    },
  );

  await mustPass(
    "bir xil jadval qayta yuborilsa QATORLAR TEGILMAYDI",
    async () => {
      const before = await prisma.groupScheduleItem.findMany({
        where: { groupId: g1.id }, select: { id: true }, orderBy: { id: "asc" },
      });
      const active = await prisma.groupScheduleItem.findMany({
        where: { groupId: g1.id, day: "tue" },
      });
      await inA(() => groups.update(g1.id, {
        schedule: active.map((s) => ({ day: s.day, startTime: s.startTime, endTime: s.endTime })),
      }));
      const after = await prisma.groupScheduleItem.findMany({
        where: { groupId: g1.id }, select: { id: true }, orderBy: { id: "asc" },
      });
      return { before, after };
    },
    ({ before, after }) =>
      JSON.stringify(before) === JSON.stringify(after)
        ? null
        : "jadval bejiz qayta yozildi (ID'lar almashdi)",
  );

  await mustPass(
    "O'QITUVCHI ALMASHTIRISH: eski davr yopiladi, yangisi ochiladi",
    async () => {
      await inA(() => groups.update(g1.id, { teachers: [t2.id] }));
      const periods = await prisma.teacherGroupPeriod.findMany({
        where: { groupId: g1.id, isDeleted: false },
        orderBy: { startDate: "asc" },
      });
      const g = await prisma.group.findUnique({
        where: { id: g1.id }, include: { teachers: { select: { id: true } } },
      });
      return { periods, g };
    },
    ({ periods, g }) => {
      const oldP = periods.find((p) => p.teacherId === t1.id);
      const newP = periods.find((p) => p.teacherId === t2.id);
      if (!oldP?.endDate) return "eski o'qituvchi davri yopilmadi";
      if (!newP || newP.endDate !== null) return "yangi o'qituvchi davri ochilmadi";
      if (g.teachers.length !== 1 || g.teachers[0].id !== t2.id) {
        return `teachers keshi sinxronlanmadi: ${JSON.stringify(g.teachers)}`;
      }
      return null;
    },
  );

  await mustPass(
    "yangi o'qituvchiga MAOSH QATORI yaratildi",
    () => prisma.teacherSalary.count({
      where: { groupId: g1.id, teacherId: t2.id, kind: "group" },
    }),
    (n) => (n === 1 ? null : `${n} ta qator`),
  );

  await mustThrow(
    "tugash sanasi boshlanishdan oldin bo'lmaydi",
    () => inA(() => groups.update(g1.id, { endDate: new Date(Date.UTC(2024, 0, 1)) })),
    "oldin bo'lmasin",
  );

  // ── 4) TOPSHIRISH (handover) ─────────────────────────────────────
  console.log("\n4) ommaviy topshirish (handover)");

  const g2 = await mustPass(
    "ikkinchi guruh (boshqa vaqtda) yaratiladi",
    () => inA(() => groups.create(
      {
        name: `Gamma ${S}`,
        schedule: [{ day: "wed", startTime: "16:00", endTime: "17:30" }],
        teachers: [t2.id],
        startDate: new Date(Date.UTC(2025, 0, 1)),
        monthlyPrice: 500_000,
      },
      { id: null },
    )),
    (g) => (g?.id ? null : "yaratilmadi"),
  );
  if (g2?.id) created.groups.push(g2.id);

  await mustPass(
    "handover: t2 ning BARCHA guruhlari t1 ga o'tadi",
    async () => {
      // Topshirish sanasi davr BOSHLANGANIDAN KEYIN bo'lishi shart:
      // o'qituvchi almashtirish davrlarni "bugun" ochgan, shuning uchun
      // ertangi kun olinadi (kelajakdagi sana handover uchun ruxsat etilgan).
      const today = new Date();
      const cutoff = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
      );
      const res = await inA(() => tgp.handover(
        {
          teacher: t2.id,
          handoverDate: cutoff,
          assignments: [{ toTeacher: t1.id, groups: [g1.id, g2.id] }],
        },
        { id: null },
      ));
      const periods = await prisma.teacherGroupPeriod.findMany({
        where: { groupId: { in: [g1.id, g2.id] }, isDeleted: false },
      });
      return { res, periods };
    },
    ({ res, periods }) => {
      if (res.closed !== 2 || res.opened !== 2) return `closed=${res.closed} opened=${res.opened}`;
      const openT1 = periods.filter((p) => p.teacherId === t1.id && p.endDate === null);
      const openT2 = periods.filter((p) => p.teacherId === t2.id && p.endDate === null);
      if (openT1.length !== 2) return `t1 da ${openT1.length} ochiq davr`;
      if (openT2.length !== 0) return `t2 da ${openT2.length} ochiq davr qoldi`;
      return null;
    },
  );

  await mustThrow(
    "guruh O'QITUVCHISIZ qolib ketmaydi (taqsimlanmagan guruh)",
    () => inA(() => tgp.handover(
      {
        teacher: t1.id,
        handoverDate: new Date(Date.now() + 2 * 86400000),
        assignments: [],
      },
      { id: null },
    )),
    "o'qituvchisiz qolib ketadi",
  );

  // ── 5) KURS TUGASHI VA QAYTA OCHISH ──────────────────────────────
  console.log("\n5) kurs tugashi va qayta ochish");

  // ALOHIDA GURUH: g1 ning o'qituvchi davri almashtirish paytida "bugun"
  // ochilgan, ya'ni 2025-08-31 sanasida u hali AKTIV emas - o'sha sanada
  // yopiladigan narsa yo'q. Hayot-tsiklni tekshirish uchun davri guruh
  // boshlanishidan ochilgan toza guruh kerak.
  const t3 = await mkTeacher("Uchinchi", bA.id);
  await prisma.teacherCompensation.create({
    data: {
      teacherId: t3.id, branchId: bA.id,
      effectiveFrom: new Date(Date.UTC(2024, 0, 1)),
      baseType: "none", variableType: "percent", variableRate: 40, percentBase: "billed",
    },
  });
  const s3 = await mkStudent("Sardor", bA.id);

  const g3 = await mustPass(
    "hayot-tsikl uchun guruh yaratiladi",
    () => inA(() => groups.create(
      {
        name: `Delta ${S}`,
        schedule: [{ day: "thu", startTime: "18:00", endTime: "19:30" }],
        teachers: [t3.id],
        startDate: new Date(Date.UTC(2025, 0, 1)),
        monthlyPrice: 300_000,
      },
      { id: null },
    )),
    (g) => (g?.id ? null : "yaratilmadi"),
  );
  if (g3?.id) created.groups.push(g3.id);
  await inA(() => groups.addStudent(g3.id, s3.id, { joinedAt: new Date(Date.UTC(2025, 0, 1)) }));

  await mustPass(
    "endDate o'tgan → guruh arxivlanadi, davr va a'zoliklar yopiladi",
    async () => {
      await inA(() => groups.update(g3.id, { endDate: new Date(Date.UTC(2025, 7, 31)) }));
      const g = await prisma.group.findUnique({ where: { id: g3.id } });
      const openMems = await prisma.groupMembership.count({
        where: { groupId: g3.id, leftAt: null, isDeleted: false },
      });
      const openPeriods = await prisma.teacherGroupPeriod.count({
        where: { groupId: g3.id, endDate: null, isDeleted: false },
      });
      return { g, openMems, openPeriods };
    },
    ({ g, openMems, openPeriods }) => {
      if (g.isActive) return "guruh arxivlanmadi";
      if (openMems !== 0) return `${openMems} ta ochiq a'zolik qoldi`;
      if (openPeriods !== 0) return `${openPeriods} ta ochiq davr qoldi`;
      // SKALYAR String[] - `undefined` bilan to'lib qolmasligi kerak.
      if (!g.archivedClosedPeriods.length) return "archivedClosedPeriods bo'sh";
      if (g.archivedClosedPeriods.some((x) => !x)) return "archivedClosedPeriods'da undefined";
      if (!g.archivedClosedMemberships.length) return "archivedClosedMemberships bo'sh";
      if (g.archivedClosedMemberships.some((x) => !x)) return "archivedClosedMemberships'da undefined";
      return null;
    },
  );

  await mustPass(
    "endDate kelajakka surilsa - davr va a'zoliklar QAYTA OCHILADI",
    async () => {
      await inA(() => groups.update(g3.id, { endDate: new Date(Date.UTC(2030, 0, 1)) }));
      const g = await prisma.group.findUnique({ where: { id: g3.id } });
      const openMems = await prisma.groupMembership.count({
        where: { groupId: g3.id, leftAt: null, isDeleted: false },
      });
      const openPeriods = await prisma.teacherGroupPeriod.count({
        where: { groupId: g3.id, endDate: null, isDeleted: false },
      });
      return { g, openMems, openPeriods };
    },
    ({ g, openMems, openPeriods }) => {
      if (!g.isActive) return "guruh qayta aktivlashmadi";
      if (openMems !== 1) return `${openMems} ta ochiq a'zolik (1 kutilgan)`;
      if (openPeriods !== 1) return `${openPeriods} ta ochiq davr (1 kutilgan)`;
      if (g.archivedClosedPeriods.length) return "arxiv surati tozalanmadi";
      return null;
    },
  );

  // ── 6) CHIQARISH VA QARZ ─────────────────────────────────────────
  console.log("\n6) o'quvchini chiqarish va qarz");

  await mustThrow(
    "qarzli o'quvchini chiqarish 409 bilan to'siladi",
    () => inA(() => groups.removeStudent(g1.id, s2.id, {})),
    "to'lanmagan qarz",
  );

  await mustPass(
    "writeOff=true bilan chiqariladi va YOMON QARZ yoziladi",
    async () => {
      const res = await inA(() => groups.removeStudent(g1.id, s2.id, { writeOff: true }, { id: null }));
      const wo = await prisma.debtWriteOff.findFirst({
        where: { studentId: s2.id, groupId: g1.id },
        include: { breakdown: true },
      });
      const frozen = await prisma.studentPayment.count({
        where: { studentId: s2.id, groupId: g1.id, writtenOff: true },
      });
      return { res, wo, frozen };
    },
    ({ res, wo, frozen }) => {
      if (!res?.membership?.leftAt) return "a'zolik yopilmadi";
      if (!wo) return "DebtWriteOff yozuvi yo'q";
      if (!wo.breakdown.length) return "breakdown bo'sh (embedded → relation)";
      if (wo.amount <= 0) return `amount=${wo.amount}`;
      if (frozen === 0) return "to'lovlar writtenOff qilinmadi";
      return null;
    },
  );

  await mustPass(
    "write-off qilingan qarz recalc bilan QAYTA OCHILMAYDI",
    async () => {
      const before = await prisma.studentPayment.findMany({
        where: { studentId: s2.id, groupId: g1.id, writtenOff: true },
        select: { id: true, expectedAmount: true, writeOffAmount: true },
        orderBy: { id: "asc" },
      });
      await payments.recalcForStudent(s2.id);
      const after = await prisma.studentPayment.findMany({
        where: { studentId: s2.id, groupId: g1.id, writtenOff: true },
        select: { id: true, expectedAmount: true, writeOffAmount: true },
        orderBy: { id: "asc" },
      });
      return { before, after };
    },
    ({ before, after }) =>
      JSON.stringify(before) === JSON.stringify(after)
        ? null
        : "yopilgan qarz qayta hisoblandi",
  );

  // ── 7) TO'LOV → DEPOZIT → GURUHNI O'CHIRISH ──────────────────────
  console.log("\n7) to'lov, depozit va guruhni butunlay o'chirish");

  await mustPass(
    "to'lov qabul qilinadi va ortiqchasi DEPOZITGA tushadi",
    async () => {
      const plan = await prisma.studentPayment.findFirst({
        where: { studentId: s1.id, groupId: g2.id },
      });
      // s1 hali g2 da yo'q - avval qo'shamiz.
      if (!plan) {
        await inA(() => groups.addStudent(g2.id, s1.id, { joinedAt: new Date(Date.UTC(2025, 0, 1)) }));
      }
      const target = await prisma.studentPayment.findFirst({
        where: { studentId: s1.id, groupId: g2.id },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      const res = await inA(() => txn.create(
        { paymentId: target.id, amount: 40_000_000, method: "cash" },
        { id: null },
      ));
      const bal = await deposits.balanceFor(s1.id);
      return { res, bal };
    },
    ({ res, bal }) => {
      if (!res.allocated) return "hech qanday taqsimot bo'lmadi";
      if (bal <= 0) return `ortiqcha depozitga tushmadi (balans ${bal})`;
      return null;
    },
  );

  await mustPass(
    "guruhni butunlay o'chirish: depozit qaytariladi, guruh yo'qoladi (ATOMIK)",
    async () => {
      const balBefore = await deposits.balanceFor(s1.id);
      // g2 ni yakunlaymiz (aktiv kursda o'quvchi bo'lsa o'chirib bo'lmaydi).
      await inA(() => groups.update(g2.id, { endDate: new Date(Date.UTC(2025, 7, 31)) }));

      // NOTO'G'RI TASDIQ NOMI - o'chirishdan OLDIN tekshiriladi, chunki
      // muvaffaqiyatli o'chirishdan keyin guruh umuman qolmaydi.
      let confirmGuard = "o'tib ketdi";
      try {
        await inA(() => groups.permanentRemove(g2.id, { id: null }, { confirmName: "Xato nom" }));
      } catch (e) {
        confirmGuard = e.message;
      }

      await inA(() => groups.permanentRemove(g2.id, { id: null }, { confirmName: `Gamma ${S}` }));
      const gone = await prisma.group.count({ where: { id: g2.id } });
      const plansGone = await prisma.studentPayment.count({ where: { groupId: g2.id } });
      const txGone = await prisma.paymentTransaction.count({ where: { groupId: g2.id } });
      const balAfter = await deposits.balanceFor(s1.id);
      return { balBefore, balAfter, gone, plansGone, txGone, confirmGuard };
    },
    ({ balBefore, balAfter, gone, plansGone, txGone, confirmGuard }) => {
      if (!/guruh nomini/i.test(confirmGuard)) return `tasdiq nomi to'silmadi: ${confirmGuard}`;
      if (gone !== 0) return "guruh o'chmadi";
      if (plansGone !== 0) return `${plansGone} ta to'lov qatori qoldi`;
      if (txGone !== 0) return `${txGone} ta tranzaksiya qoldi`;
      if (balAfter < balBefore) return `depozit kamaydi: ${balBefore} → ${balAfter}`;
      return null;
    },
  );

  // ── 8) FILIAL IZOLYATSIYASI ──────────────────────────────────────
  console.log("\n8) filial izolyatsiyasi");

  await mustPass(
    "B filial ro'yxatida A filial guruhi YO'Q",
    () => inB(() => groups.list({ limit: 200 })),
    (r) => (r.items.some((g) => g.id === g1.id) ? "A filial guruhi sizib chiqdi" : null),
  );

  await mustThrow(
    "B kontekstida A filial guruhi ochilmaydi",
    () => inB(() => groups.getById(g1.id)),
    "topilmadi",
  );

  await mustThrow(
    "B kontekstida A filial guruhini o'chirib bo'lmaydi",
    () => inB(() => groups.permanentRemove(g1.id, { id: null }, { confirmName: `Alpha ${S}` })),
    "topilmadi",
  );

  await mustPass(
    "A filial ro'yxatida guruh soni va narxi to'g'ri",
    () => inA(() => groups.list({ limit: 200 })),
    (r) => {
      const row = r.items.find((g) => g.id === g1.id);
      if (!row) return "guruh ro'yxatda yo'q";
      if (typeof row.studentsCount !== "number") return "studentsCount yo'q";
      if (!row._id) return "_id taxallusi yo'q";
      if (!Array.isArray(row.teachers)) return "teachers massiv emas";
      return null;
    },
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
