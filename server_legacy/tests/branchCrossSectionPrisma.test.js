/**
 * FILIALLAR KESIMI — SOTUV VA O'QITUVCHI TAHLILI (Prisma).
 *
 * ═══════════════════════════════════════════════════════════════════
 * BU TEST TO'RT NARSANI QAT'IY TEKSHIRADI
 *
 * 1) KOGORTA CHALKASHMASLIGI. Konversiya foizi BITTA to'plamdan
 *    hisoblanishi kerak: "davr ichida KELGAN lidlarning nechtasi
 *    o'quvchiga aylandi". Surat "davrda aylangan", maxraj esa
 *    "davrda kelgan" bo'lsa, foiz ikki xil odamlar to'plamini
 *    taqqoslardi va 100% dan oshib ketishi ham mumkin edi.
 *
 * 2) NULL vs 0. Lid yo'q bo'lsa konversiya `null` - "0% konversiya"
 *    degan AYBLOV emas. O'qituvchi yo'q bo'lsa yuklama `null`.
 *    Bu farq rahbariyat ekranida qaror o'zgartiradi.
 *
 * 3) FILIAL IZOLYATSIYASI - adversarial. Filial direktori boshqa
 *    filialning sotuv voronkasini va maosh fondini ko'ra olmaydi.
 *
 * 4) TAKRORIY SANOQ YO'Q. Bir o'qituvchi ikki guruhda dars bersa
 *    BIR MARTA sanaladi; ikki filialda dars bersa IKKALASIDA ham
 *    (chunki u ikkalasida ham resurs).
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run test:branch-cross
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as salesSvc from "../src/modules/branchAnalytics/services/branchSales.service.js";
import * as teachersSvc from "../src/modules/branchAnalytics/services/branchTeachers.service.js";
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
    bad(name, err?.message?.slice(0, 180));
    return null;
  }
};

const S = `bx${Date.now().toString(36)}`;
const created = { users: [], branches: [], groups: [], courses: [], options: [] };

const cleanup = async () => {
  const { users, branches, groups, courses, options } = created;
  if (branches.length) {
    await prisma.teacherSalary.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  }
  if (groups.length) {
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.group.deleteMany({ where: { id: { in: groups } } });
  }
  if (options.length) {
    await prisma.leadOption.deleteMany({ where: { id: { in: options } } });
  }
  if (courses.length) await prisma.course.deleteMany({ where: { id: { in: courses } } });
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkUser = async (name, role, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: name,
      lastName: "BX",
      username: `${name.toLowerCase()}_${S}`,
      passwordHash: "x",
      role,
      homeBranchId: branchId,
      ...(role === ROLES.STUDENT
        ? { enrolledAt: new Date(Date.UTC(2024, 0, 1)) }
        : { hiredAt: new Date(Date.UTC(2024, 0, 1)) }),
    },
  });
  created.users.push(u.id);
  return u;
};

// Oraliq: 2025-03-01 .. 2025-05-31. Sanalar QAT'IY - "hozir" ga
// bog'lansa test kechasi soat 00:00 da boshqacha natija berardi.
const FROM = new Date(Date.UTC(2025, 2, 1));
const TO = new Date(Date.UTC(2025, 4, 31, 23, 59, 59));
const inRange = (day) => new Date(Date.UTC(2025, 3, day)); // aprel
const beforeRange = new Date(Date.UTC(2025, 0, 10)); // yanvar

const run = async () => {
  console.log("\n=== FILIALLAR KESIMI: SOTUV + O'QITUVCHI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const bA = await prisma.branch.create({ data: { name: `BX A ${S}` } });
  const bB = await prisma.branch.create({ data: { name: `BX B ${S}` } });
  created.branches.push(bA.id, bB.id);

  const srcIg = await prisma.leadOption.create({
    data: { kind: "source", name: `Instagram ${S}` },
  });
  created.options.push(srcIg.id);

  const scopeA = {
    branchId: bA.id,
    allowedBranchIds: [bA.id],
    canSeeAllBranches: false,
    userId: null,
  };
  const superAdmin = {
    branchId: null,
    allowedBranchIds: [bA.id, bB.id],
    canSeeAllBranches: true,
    userId: null,
  };
  const inA = (fn) => runWithBranchContext(scopeA, fn);
  const asSuper = (fn) => runWithBranchContext(superAdmin, fn);

  // ══════════════════════════════════════════════════════════════
  // 1) SOTUV VORONKASI
  // ══════════════════════════════════════════════════════════════
  console.log("1) sotuv voronkasi");

  const mkLead = (data) =>
    prisma.lead.create({
      data: {
        firstName: `L${S}`,
        phone: "+998900000000",
        branchId: bA.id,
        ...data,
      },
    });

  // A filial, DAVR ICHIDA kelgan 4 ta lid:
  //   1 ta yozildi (manba: Instagram, 10 kunda)
  //   1 ta rad etildi
  //   2 tasi hali ochiq (biri manbasiz)
  await mkLead({
    createdAt: inRange(1),
    status: "enrolled",
    convertedAt: inRange(11),
    sourceId: srcIg.id,
  });
  await mkLead({ createdAt: inRange(2), status: "rejected", sourceId: srcIg.id });
  await mkLead({ createdAt: inRange(3), status: "trial", sourceId: srcIg.id });
  await mkLead({ createdAt: inRange(4), status: "new" }); // manbasiz

  // DAVRDAN OLDIN kelgan, lekin DAVR ICHIDA yozilgan lid.
  // Kogortaga KIRMAYDI (createdAt tashqarida), lekin davr natijasiga
  // KIRADI - aynan shu ikki raqamning farqi tekshiriladi.
  await mkLead({
    createdAt: beforeRange,
    status: "enrolled",
    convertedAt: inRange(20),
    sourceId: srcIg.id,
  });

  // B filialda 2 ta lid, ikkalasi ham ochiq.
  await mkLead({ createdAt: inRange(5), status: "new", branchId: bB.id });
  await mkLead({ createdAt: inRange(6), status: "new", branchId: bB.id });

  await mustPass(
    "KOGORTA konversiyasi: 4 lid / 1 yozilgan = 25%",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!a) return "A filial yo'q";
      if (a.leads !== 4) return `leads=${a.leads} (4 kutilgan — davrdan oldingi lid kogortaga kirmasligi kerak)`;
      if (a.enrolled !== 1) return `enrolled=${a.enrolled}`;
      if (a.conversionPercent !== 25) return `conversionPercent=${a.conversionPercent}`;
      return null;
    },
  );

  await mustPass(
    "DAVR NATIJASI kogortadan ALOHIDA: enrolledInRange = 2",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      // Davr ichida IKKI lid yozildi: biri shu davrda kelgan, biri
      // yanvarda. Kogorta esa faqat bittasini biladi.
      if (a.enrolledInRange !== 2) return `enrolledInRange=${a.enrolledInRange} (2 kutilgan)`;
      if (a.enrolled === a.enrolledInRange) {
        return "kogorta va davr natijasi bir xil chiqdi — ikkisi aralashib ketgan";
      }
      return null;
    },
  );

  await mustPass(
    "status taqsimoti: rejected=1, open=2",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (a.rejected !== 1) return `rejected=${a.rejected}`;
      if (a.open !== 2) return `open=${a.open}`;
      // Uch bo'lak butunni tashkil qilishi SHART - aks holda ekranda
      // "jami 4, lekin bo'laklar 3" degan qarama-qarshilik chiqardi.
      if (a.enrolled + a.rejected + a.open !== a.leads) {
        return `bo'laklar yig'indisi ${a.enrolled + a.rejected + a.open} ≠ ${a.leads}`;
      }
      return null;
    },
  );

  await mustPass(
    "o'rtacha konversiya kuni = 10 (convertedAt YO'Q lidlar hisobga kirmaydi)",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (a.avgDaysToConvert !== 10) return `avgDaysToConvert=${a.avgDaysToConvert} (10 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "MANBASIZ lid alohida qator: bySource yig'indisi = jami lid",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      const sum = a.bySource.reduce((s, x) => s + x.leads, 0);
      if (sum !== a.leads) return `bySource=${sum} ≠ leads=${a.leads}`;
      const none = a.bySource.find((x) => x.sourceId === null);
      if (!none) return "manbasiz qator yo'q — jimgina tashlab yuborilgan";
      if (none.name !== "Ko'rsatilmagan") return `nomi "${none.name}"`;
      return null;
    },
  );

  await mustPass(
    "FILIAL IZOLYATSIYASI: A kontekstida B filial YO'Q",
    () => inA(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) =>
      rows.some((r) => String(r.branchId) === String(bB.id)) ? "B sizib chiqdi" : null,
  );

  await mustPass(
    "SUPER ADMIN ikkala filialni ko'radi; B da konversiya 0% (null EMAS)",
    () => asSuper(() => salesSvc.sales({ from: FROM, to: TO })),
    (rows) => {
      const b = rows.find((r) => String(r.branchId) === String(bB.id));
      if (!b) return "B filial yo'q";
      if (b.leads !== 2) return `B.leads=${b.leads}`;
      // Lid BOR, lekin hech biri yozilmagan - bu haqiqiy 0%, "hisoblab
      // bo'lmaydi" emas.
      if (b.conversionPercent !== 0) return `B.conversionPercent=${b.conversionPercent}`;
      return null;
    },
  );

  await mustPass(
    "lid YO'Q davr: konversiya `null` (0% degan ayblov emas)",
    // 2020-yil — bu davrda hech qanday lid yo'q.
    () =>
      asSuper(() =>
        salesSvc.sales({
          from: new Date(Date.UTC(2020, 0, 1)),
          to: new Date(Date.UTC(2020, 1, 1)),
        }),
      ),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!a) return null; // filial umuman qatorga tushmasa ham to'g'ri
      if (a.conversionPercent !== null) {
        return `conversionPercent=${a.conversionPercent} (null kutilgan)`;
      }
      return null;
    },
  );

  // ══════════════════════════════════════════════════════════════
  // 2) O'QITUVCHI RESURSI
  // ══════════════════════════════════════════════════════════════
  console.log("\n2) o'qituvchi resursi");

  const course = await prisma.course.create({
    data: { title: `K ${S}`, code: `k_${S}` },
  });
  created.courses.push(course.id);

  const tShared = await mkUser("Tolib", ROLES.TEACHER, bA.id);
  const tOnlyB = await mkUser("Bekzod", ROLES.TEACHER, bB.id);

  const mkGroup = async (name, branchId, teacherIds) => {
    const g = await prisma.group.create({
      data: {
        name,
        branchId,
        courseId: course.id,
        isActive: true,
        ...(teacherIds.length
          ? { teachers: { connect: teacherIds.map((id) => ({ id })) } }
          : {}),
      },
    });
    created.groups.push(g.id);
    return g;
  };

  // A: bitta o'qituvchi IKKI guruhda + bitta o'qituvchisiz guruh.
  const gA1 = await mkGroup(`A1 ${S}`, bA.id, [tShared.id]);
  const gA2 = await mkGroup(`A2 ${S}`, bA.id, [tShared.id]);
  await mkGroup(`A3 ${S}`, bA.id, []);
  // B: o'sha Tolib B da ham dars beradi + Bekzod.
  const gB1 = await mkGroup(`B1 ${S}`, bB.id, [tShared.id, tOnlyB.id]);

  const st1 = await mkUser("Anvar", ROLES.STUDENT, bA.id);
  const st2 = await mkUser("Sardor", ROLES.STUDENT, bA.id);
  // Bitta o'quvchi IKKI guruhda - u BIR MARTA sanalishi kerak.
  await prisma.groupMembership.create({
    data: { groupId: gA1.id, studentId: st1.id, joinedAt: inRange(1) },
  });
  await prisma.groupMembership.create({
    data: { groupId: gA2.id, studentId: st1.id, joinedAt: inRange(1) },
  });
  await prisma.groupMembership.create({
    data: { groupId: gA1.id, studentId: st2.id, joinedAt: inRange(1) },
  });
  await prisma.groupMembership.create({
    data: { groupId: gB1.id, studentId: st2.id, joinedAt: inRange(1) },
  });

  await mustPass(
    "o'qituvchi TAKROR sanalmaydi: A da 2 guruh, 1 o'qituvchi",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!a) return "A filial yo'q";
      if (a.teacherCount !== 1) return `teacherCount=${a.teacherCount} (1 kutilgan)`;
      if (a.activeGroups !== 3) return `activeGroups=${a.activeGroups} (3 kutilgan)`;
      if (a.groupsPerTeacher !== 3) return `groupsPerTeacher=${a.groupsPerTeacher}`;
      return null;
    },
  );

  await mustPass(
    "O'QITUVCHISIZ guruh alohida sanaladi (boshqaruv muammosi)",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (a.groupsWithoutTeacher !== 1) {
        return `groupsWithoutTeacher=${a.groupsWithoutTeacher} (1 kutilgan)`;
      }
      return null;
    },
  );

  await mustPass(
    "o'quvchi TAKROR sanalmaydi: A da 2 ta noyob o'quvchi",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (a.students !== 2) return `students=${a.students} (2 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "IKKI FILIALDA dars beruvchi o'qituvchi IKKALASIDA ham sanaladi",
    () => asSuper(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      const b = rows.find((r) => String(r.branchId) === String(bB.id));
      if (!b) return "B filial yo'q";
      if (a.teacherCount !== 1) return `A.teacherCount=${a.teacherCount}`;
      if (b.teacherCount !== 2) return `B.teacherCount=${b.teacherCount} (2 kutilgan)`;
      return null;
    },
  );

  await mustPass(
    "FILIAL IZOLYATSIYASI: A kontekstida B filial YO'Q",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) =>
      rows.some((r) => String(r.branchId) === String(bB.id)) ? "B sizib chiqdi" : null,
  );

  // ── MAOSH: oraliqdagi oylar ──
  // Aprel (davr ichida) va yanvar (davrdan tashqarida).
  const mkSalary = (year, month, groupId, expected) =>
    prisma.teacherSalary.create({
      data: {
        branchId: bA.id,
        teacherId: tShared.id,
        groupId,
        kind: "group",
        year,
        month,
        expectedAmount: expected,
        paidAmount: 0,
      },
    });
  await mkSalary(2025, 4, gA1.id, 1_000_000);
  await mkSalary(2025, 1, gA2.id, 9_000_000);

  await mustPass(
    "maosh faqat ORALIQDAGI oylardan yig'iladi (yanvar KIRMAYDI)",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (a.salaryExpected !== 1_000_000) {
        return `salaryExpected=${a.salaryExpected} (1 000 000 kutilgan; 9 000 000 yanvarniki)`;
      }
      if (a.salaryPerTeacher !== 1_000_000) {
        return `salaryPerTeacher=${a.salaryPerTeacher}`;
      }
      return null;
    },
  );

  await mustPass(
    "daromad 0 bo'lsa maosh ulushi `null` (manfiy/nol maxrajdan foiz chiqarilmaydi)",
    () => inA(() => teachersSvc.teachers({ from: FROM, to: TO })),
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      // Bu testda jurnal yozuvi yo'q, ya'ni daromad 0.
      if (a.salaryShareOfRevenue !== null) {
        return `salaryShareOfRevenue=${a.salaryShareOfRevenue} (null kutilgan)`;
      }
      return null;
    },
  );

  await mustPass(
    "o'qituvchisiz filialda yuklama `null` (0 EMAS)",
    // Faol guruhi bo'lmagan, lekin maoshi bor filial holatini
    // modellashtirish uchun A ning guruhlarini vaqtincha yopamiz.
    async () => {
      await prisma.group.updateMany({
        where: { id: { in: [gA1.id, gA2.id] } },
        data: { isActive: false },
      });
      const rows = await inA(() => teachersSvc.teachers({ from: FROM, to: TO }));
      await prisma.group.updateMany({
        where: { id: { in: [gA1.id, gA2.id] } },
        data: { isActive: true },
      });
      return rows;
    },
    (rows) => {
      const a = rows.find((r) => String(r.branchId) === String(bA.id));
      if (!a) return "A filial yo'q — maoshi bor filial yo'qolib ketdi";
      if (a.teacherCount !== 0) return `teacherCount=${a.teacherCount}`;
      if (a.groupsPerTeacher !== null) {
        return `groupsPerTeacher=${a.groupsPerTeacher} (null kutilgan)`;
      }
      if (a.studentsPerTeacher !== null) {
        return `studentsPerTeacher=${a.studentsPerTeacher} (null kutilgan)`;
      }
      return null;
    },
  );

  console.log(`\n=== NATIJA: ${R.pass} ✅  ${R.fail} ❌ ===\n`);
};

try {
  await run();
} catch (err) {
  console.error("\nTEST YIQILDI:", err);
  R.fail += 1;
} finally {
  try {
    await cleanup();
  } catch (err) {
    // TOZALASH XATOSI TESTNI YIQITADI - aks holda qolib ketgan
    // yozuvlar keyingi testlarni (va brauzer tekshiruvini) jimgina
    // buzardi.
    console.error("TOZALASH XATOSI:", err?.message);
    R.fail += 1;
  }
  await prisma.$disconnect();
}

process.exit(R.fail > 0 ? 1 : 0);
