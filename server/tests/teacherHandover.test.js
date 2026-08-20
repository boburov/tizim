/**
 * GURUHLARNI OMMAVIY TOPSHIRISH TESTI (ishdan bo'shatish oqimi).
 *
 * SAVOL: "O'qituvchi ishdan ketsa, uning 3 ta guruhini 2 ta boshqa
 * o'qituvchiga bo'lib bersam - maosh kunlar bo'yicha to'g'ri bo'linadimi va
 * guruh o'qituvchisiz qolib ketmaydimi?"
 *
 * Bu test to'rtta xulq-atvorni qulflaydi:
 *   1. TAQSIMOT: bir amalda bir nechta qabul qiluvchi (2 guruh + 1 guruh);
 *   2. PRORATSIYA: eski o'qituvchi 20 kunlik, yangisi 11 kunlik haq oladi
 *      (iyul = 31 kun) - hech bir kun ikki marta to'lanmaydi;
 *   3. STAVKA MEROSI: yangi o'qituvchi O'Z shartnomasi bo'yicha oladi.
 *      Bu eng nozik joyi - davr yaratishning standart yo'li stavkani
 *      "fixed 0" qilib yozadi va yangi o'qituvchi NOL maosh olib qolardi;
 *   4. QO'RIQCHI: taqsimotga kirmagan guruh o'qituvchisiz qolsa - rad etiladi.
 *
 * IZOLYATSIYA: alohida "<db>_handover_test" bazasi, oxirida o'chiriladi.
 *
 * ISHLATISH:
 *   npm run test:handover
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

const BASE_DB = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/bayyina";
/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * Alohida Mongo bazasi + `dropDatabase()` o'rniga prefiksli fixture va
 * kafolatli tozalash (`tests/helpers/prismaFixtures.js`). Xavfsizlik va
 * biznes DA'VOLARI o'zgarmadi — faqat ma'lumotga murojaat qatlami.
 *
 * Bog'lanish maydonlari qayta nomlandi: `teacher` → `teacherId`,
 * `group` → `groupId`, `student` → `studentId` va h.k.
 */
const fx = createFixtures();
/** Tozalashda kerak (servis yaratgan qatorlarni topish uchun). */
let fxBranchId = null;

const R = { pass: 0, fail: 0, notes: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.notes.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → ${d}`);
};
const check = (name, cond, detail = "") =>
  cond ? ok(name) : bad(name, detail || "shart bajarilmadi");
const money = (n) => new Intl.NumberFormat("ru-RU").format(Math.round(n || 0));

const expectThrow = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e?.message || String(e);
  }
};

const D = (s) => new Date(`${s}T00:00:00.000Z`);

const run = async () => {
  const periodService = await import(
    "../src/modules/groups/services/teacherGroupPeriod.service.js"
  );

  const branch = await fx.branch("Asosiy-hand", { isActive: true });
  fxBranchId = branch.id;
  const owner = await fx.user("owner_hand", {
    firstName: "Ega",
    lastName: "Egayev",
    passwordHash: "x",
    role: "owner",
    homeBranchId: branch.id,
  });

  let seq = 0;
  // Har o'qituvchining O'Z standart stavkasi (guruh boshiga oylik).
  const mkTeacher = async (first, perGroupRate) => {
    const u = await fx.user(`t_hand_${(seq += 1)}`, {
      firstName: first,
      lastName: "Testov",
      passwordHash: "x",
      role: "teacher",
      homeBranchId: branch.id,
    });
    const comp = await prisma.teacherCompensation.create({
      data: {
      teacherId: u.id,
      branchId: branch.id,
      effectiveFrom: D("2026-01-01"),
      baseType: "none",
      variableType: "per_group",
      variableRate: perGroupRate,
      },
    });
    fx.track("teacherCompensation", comp.id);
    return u;
  };

  // Guruhlar bir-biriga JADVAL bo'yicha to'qnashmasligi kerak - aks holda
  // bitta o'qituvchiga ikkitasini berib bo'lmaydi.
  let gseq = 0;
  const SLOTS = [
    { day: "mon", startTime: "09:00", endTime: "11:00" },
    { day: "tue", startTime: "09:00", endTime: "11:00" },
    { day: "wed", startTime: "09:00", endTime: "11:00" },
    { day: "thu", startTime: "09:00", endTime: "11:00" },
  ];
  const mkGroup = async (name) =>
    fx.group(name, branch.id, {
      // `course` ATAYLAB berilmaydi — ixtiyoriy FK, soxta ID
      // `groups_courseId_fkey` ni buzardi.
      startDate: D("2026-07-01"),
      schedule: { create: [SLOTS[gseq++ % SLOTS.length]] },
      isActive: true,
    });

  const OLD_RATE = 3_000_000;
  const NEW_RATE = 6_000_000; // ataylab BOSHQA - meros ishlayotganini ko'rsatadi

  const leaving = await mkTeacher("Ketayotgan", OLD_RATE);
  const aziza = await mkTeacher("Aziza", NEW_RATE);
  const bekzod = await mkTeacher("Bekzod", NEW_RATE);

  const g1 = await mkGroup("Guruh-1");
  const g2 = await mkGroup("Guruh-2");
  const g3 = await mkGroup("Guruh-3");

  // Ketayotgan o'qituvchi 1-iyuldan uchala guruhda dars beradi (ochiq davr).
  for (const g of [g1, g2, g3]) {
    await periodService.create(
      {
        teacher: leaving.id,
        group: g.id,
        startDate: D("2026-07-01"),
        inheritStandardRate: true,
      },
      owner,
    );
  }

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m1) Guruh o'qituvchisiz qolmasligi qo'riqchisi\x1b[0m");

  // g3 taqsimotga kiritilmagan - va unda boshqa o'qituvchi yo'q.
  const orphanErr = await expectThrow(() =>
    periodService.handover(
      {
        teacher: leaving.id,
        handoverDate: "2026-07-21",
        assignments: [{ toTeacher: aziza.id, groups: [String(g1.id)] }],
      },
      owner,
    ),
  );
  check("taqsimlanmagan guruh — rad etildi", orphanErr !== null);
  check(
    "xabarda aynan qaysi guruh qolayotgani aytilgan",
    !!orphanErr && orphanErr.includes("Guruh-2") && orphanErr.includes("Guruh-3"),
    `xabar: ${orphanErr}`,
  );

  const dupErr = await expectThrow(() =>
    periodService.handover(
      {
        teacher: leaving.id,
        handoverDate: "2026-07-21",
        assignments: [
          { toTeacher: aziza.id, groups: [String(g1.id), String(g2.id), String(g3.id)] },
          { toTeacher: bekzod.id, groups: [String(g1.id)] },
        ],
      },
      owner,
    ),
  );
  check("bitta guruh ikki o'qituvchiga berilsa — rad etildi", dupErr !== null);

  const selfErr = await expectThrow(() =>
    periodService.handover(
      {
        teacher: leaving.id,
        handoverDate: "2026-07-21",
        assignments: [
          { toTeacher: leaving.id, groups: [String(g1.id), String(g2.id), String(g3.id)] },
        ],
      },
      owner,
    ),
  );
  check("o'ziga topshirish — rad etildi", selfErr !== null);

  // Hech narsa yozilmaganini tasdiqlaymiz (yarim topshirish bo'lmasin).
  const stillOpen = await prisma.teacherGroupPeriod.count({
    where: {
      teacherId: leaving.id,
      endDate: null,
      isDeleted: false,
    },
  });
  check("rad etilgan urinishlardan keyin hech narsa o'zgarmagan", stillOpen === 3, `ochiq davr: ${stillOpen}`);

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m2) Bir amalda ikki o'qituvchiga taqsimlash\x1b[0m");

  const res = await periodService.handover(
    {
      teacher: leaving.id,
      handoverDate: "2026-07-21",
      assignments: [
        { toTeacher: aziza.id, groups: [String(g1.id), String(g2.id)] },
        { toTeacher: bekzod.id, groups: [String(g3.id)] },
      ],
    },
    owner,
  );
  check("3 ta guruh yopildi", res.closed === 3, `${res.closed}`);
  check("3 ta yangi davr ochildi", res.opened === 3, `${res.opened}`);

  const azizaGroups = await periodService.activeGroupIdsForTeacher(
    aziza.id,
    D("2026-07-25"),
  );
  check("Aziza 2 ta guruh oldi", azizaGroups.length === 2, `${azizaGroups.length}`);
  const bekzodGroups = await periodService.activeGroupIdsForTeacher(
    bekzod.id,
    D("2026-07-25"),
  );
  check("Bekzod 1 ta guruh oldi", bekzodGroups.length === 1, `${bekzodGroups.length}`);
  const leavingAfter = await periodService.activeGroupIdsForTeacher(
    leaving.id,
    D("2026-07-25"),
  );
  check("ketayotganda guruh qolmadi", leavingAfter.length === 0, `${leavingAfter.length}`);

  // Guruh keshi ham yangilangan bo'lishi kerak (UI shuni ko'rsatadi).
  // ⚠ `Group.teachers` endi KO'P-KO'PGA bog'lanish (Mongo'da ID massivi
  // edi) — u `include` bilan OCHIQ so'ralishi kerak, aks holda Prisma
  // uni umuman qaytarmaydi va tekshiruv `undefined` ga urilardi.
  const g1After = await prisma.group.findUnique({
    where: { id: g1.id },
    include: { teachers: { select: { id: true } } },
  });
  const teacherIds = (g1After?.teachers || []).map((t) => String(t.id));
  check(
    "Group.teachers keshi yangi o'qituvchini ko'rsatyapti",
    teacherIds.includes(String(aziza.id)) && !teacherIds.includes(String(leaving.id)),
    `kesh: ${teacherIds}`,
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m3) Maosh kunlar bo'yicha bo'lindi (iyul = 31 kun)\x1b[0m");

  const salaryOf = async (teacherId, groupId) =>
    prisma.teacherSalary.findFirst({
      where: { teacherId, groupId, year: 2026, month: 7, kind: "group" },
    });

  // Eski: [1-iyul, 21-iyul) = 20 kun. Yangi: [21-iyul, ...] = 11 kun.
  const oldSal = await salaryOf(leaving.id, g1.id);
  const newSal = await salaryOf(aziza.id, g1.id);

  check("eski o'qituvchiga 20 kun yozildi", oldSal?.payableDays === 20, `${oldSal?.payableDays}`);
  check("yangi o'qituvchiga 11 kun yozildi", newSal?.payableDays === 11, `${newSal?.payableDays}`);
  check(
    "kunlar yig'indisi = oydagi kunlar (bir kun ikki marta to'lanmadi)",
    (oldSal?.payableDays || 0) + (newSal?.payableDays || 0) === 31,
  );

  const expectOld = Math.round(OLD_RATE * (20 / 31));
  check(
    "eski o'qituvchi summasi 20 kunlik",
    oldSal?.expectedAmount === expectOld,
    `kutilgan ${money(expectOld)}, chiqdi ${money(oldSal?.expectedAmount)}`,
  );

  // ENG MUHIM: yangi o'qituvchi O'Z stavkasi bo'yicha (0 emas, eski
  // o'qituvchinikida ham emas).
  const expectNew = Math.round(NEW_RATE * (11 / 31));
  check(
    "yangi o'qituvchi O'Z stavkasi bo'yicha oldi (meros ishladi)",
    newSal?.expectedAmount === expectNew,
    `kutilgan ${money(expectNew)}, chiqdi ${money(newSal?.expectedAmount)}`,
  );
  check(
    "yangi o'qituvchi maoshi NOL emas",
    (newSal?.expectedAmount || 0) > 0,
    "stavka merosi ishlamadi - davrga 'fixed 0' yozilgan",
  );

  // ─────────────────────────────────────────────────────────────────
  console.log("\n\x1b[1m4) Takroriy topshirish\x1b[0m");

  const againErr = await expectThrow(() =>
    periodService.handover(
      {
        teacher: leaving.id,
        handoverDate: "2026-07-21",
        assignments: [{ toTeacher: aziza.id, groups: [String(g1.id)] }],
      },
      owner,
    ),
  );
  check("guruhi qolmagan o'qituvchini qayta topshirish — rad etildi", againErr !== null);

  // ─────────────────────────────────────────────────────────────────

  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
      `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
  );
  if (R.notes.length) {
    console.log("\nYiqilganlar:");
    R.notes.forEach((n) => console.log(`  - ${n}`));
  }
  process.exit(R.fail ? 1 : 0);
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    // Servis yaratgan davr va maosh qatorlarini ham tozalaymiz.
    // ⚠ `TeacherGroupPeriod` da `branchId` YO'Q — u guruh orqali
    // bog'lanadi (`resourceScope` reyestrida ham `via-group`).
    const fxGroups = await prisma.group
      .findMany({ where: { branchId: fxBranchId || "" }, select: { id: true } })
      .catch(() => []);
    const periods = await prisma.teacherGroupPeriod
      .findMany({ where: { groupId: { in: fxGroups.map((g) => g.id) } }, select: { id: true } })
      .catch(() => []);
    for (const r of periods) fx.track("teacherGroupPeriod", r.id);
    const salaries = await prisma.teacherSalary
      .findMany({ where: { branchId: fxBranchId || "" }, select: { id: true } })
      .catch(() => []);
    for (const r of salaries) fx.track("teacherSalary", r.id);

    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(
      `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ` +
        `${R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"}`,
    );
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
