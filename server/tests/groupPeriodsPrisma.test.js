/**
 * GURUH QATLAMI — Prisma'ga ko'chirilgan O'QISH/REZOLVER yo'llari.
 *
 * QAMROV CHEGARASI OCHIQ AYTILADI: bu test `teacherGroupPeriod.service.js`
 * ning YOZMAYDIGAN funksiyalarini va ikki helperni tekshiradi.
 *
 * `create/update/remove/handover/assignTeacher/unassignTeacher` BU YERDA
 * SINALMAYDI - ular `recomputeForRange()` orqali hali ko'chirilmagan
 * `teacherSalary.service.js` ga tegadi. Ularni "o'tdi" deb ko'rsatish
 * yolg'on bo'lardi, `try/catch` bilan o'rab yuborish esa maosh qayta
 * hisobini jimgina yo'qotardi - ikkalasi ham qabul qilinmadi.
 * Qarang: MIGRATION.md, "GROUPS to'lqini".
 *
 * Tekshiriladigan xavflar:
 *   1) JADVAL. `Group.schedule` embedded massivdan RELATION'ga ko'chdi.
 *      `include` unutilsa massiv bo'sh kelib, to'qnashuv tekshiruvi
 *      JIMGINA hech nimani tutmay qo'yardi.
 *   2) `Group.teachers` massivdan KO'P-KO'PGA bog'lanishga ko'chdi
 *      (`set` / `some`).
 *   3) MAYDON NOMLARI: `teacher`/`group` → `teacherId`/`groupId`.
 *      Chaqiruvchilar (teacherSalary) hamon `r.teacher` o'qiydi, shuning
 *      uchun moslashtiruv saqlanganini tekshiramiz.
 *   4) BigInt: `BotUser.telegramId` Postgres'da BigInt - JSON.stringify
 *      uni seriyalay olmaydi va javob 500 bilan yiqilardi.
 *
 * ISHLATISH:  npm run test:group-periods
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as tgp from "../src/modules/groups/services/teacherGroupPeriod.service.js";
import { attachBotStatus, BOT_STATUS } from "../src/helpers/botStatus.helper.js";
import { deleteGroup, restoreGroup } from "../src/helpers/cascadeDelete.helper.js";
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

const SUFFIX = `g${Date.now().toString(36)}`;
const created = { users: [], groups: [], branches: [], bots: [] };

const cleanup = async () => {
  const { users, groups, branches, bots } = created;
  if (bots.length) await prisma.botUser.deleteMany({ where: { id: { in: bots } } });
  if (users.length) {
    await prisma.teacherGroupPeriod.deleteMany({ where: { teacherId: { in: users } } });
  }
  if (groups.length) {
    await prisma.teacherGroupPeriod.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupMembership.deleteMany({ where: { groupId: { in: groups } } });
    await prisma.groupScheduleItem.deleteMany({ where: { groupId: { in: groups } } });
    for (const gid of groups) {
      await prisma.group
        .update({ where: { id: gid }, data: { teachers: { set: [] } } })
        .catch(() => {});
    }
    await prisma.group.deleteMany({ where: { id: { in: groups } } });
  }
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } });
  if (branches.length) await prisma.branch.deleteMany({ where: { id: { in: branches } } });
};

const mkTeacher = async (first, branchId) => {
  const u = await prisma.user.create({
    data: {
      firstName: first,
      lastName: "Ustoz",
      username: `${first.toLowerCase()}_${SUFFIX}`,
      passwordHash: "x",
      role: ROLES.TEACHER,
      homeBranchId: branchId,
      hiredAt: new Date("2024-01-01"),
    },
  });
  created.users.push(u.id);
  return u;
};

const mkGroup = async (name, branchId, slots) => {
  const g = await prisma.group.create({
    data: {
      name: `${name} ${SUFFIX}`,
      branchId,
      startDate: new Date("2024-01-01"),
      schedule: { create: slots },
    },
  });
  created.groups.push(g.id);
  return g;
};

// Davrni SERVIS ORQALI emas, to'g'ridan-to'g'ri yozamiz: servis create()
// maosh qayta hisobiga tegadi (hali ko'chirilmagan), bu test esa faqat
// o'qish yo'llarini tekshiradi.
const mkPeriod = async (teacherId, groupId, startDate, endDate = null) => {
  const p = await prisma.teacherGroupPeriod.create({
    data: { teacherId, groupId, startDate, endDate },
  });
  return p;
};

const run = async () => {
  console.log("\n=== GURUH DAVRLARI / PRISMA TESTI ===\n");
  await prisma.$queryRaw`SELECT 1`;

  const branch = await prisma.branch.create({ data: { name: `Guruh test ${SUFFIX}` } });
  created.branches.push(branch.id);

  // Dushanba 09:00-10:30 va 14:00-15:00 - ikkinchi guruh birinchisi bilan
  // to'qnashadi, uchinchisi (16:00) to'qnashmaydi.
  const gA = await mkGroup("A guruh", branch.id, [
    { day: "mon", startTime: "09:00", endTime: "10:30" },
  ]);
  const gB = await mkGroup("B guruh", branch.id, [
    { day: "mon", startTime: "10:00", endTime: "11:00" },
  ]);
  const gC = await mkGroup("C guruh", branch.id, [
    { day: "mon", startTime: "16:00", endTime: "17:00" },
  ]);

  const band = await mkTeacher("Band", branch.id);
  const bosh = await mkTeacher("Bosh", branch.id);

  // "Band" o'qituvchi A guruhida ochiq davrda dars beradi.
  const openPeriod = await mkPeriod(band.id, gA.id, new Date("2024-02-01"));
  // Yopilgan (tarixiy) davr - "hozir aktiv" hisobiga KIRMASLIGI kerak.
  await mkPeriod(bosh.id, gA.id, new Date("2024-01-01"), new Date("2024-02-01"));

  // ── 1) JADVAL TO'QNASHUVI ────────────────────────────────────────
  console.log("1) jadval to'qnashuvi (schedule relation)");

  await mustThrow(
    "to'qnashuvchi jadval rad etiladi",
    () => tgp.assertTeacherScheduleFree(
      band.id,
      [{ day: "mon", startTime: "10:00", endTime: "11:00", effectiveFrom: null }],
      gB.id,
    ),
    "bu vaqtda darsi bor",
  );

  await mustPass(
    "to'qnashmaydigan jadval o'tadi",
    () => tgp.assertTeacherScheduleFree(
      band.id,
      [{ day: "mon", startTime: "16:00", endTime: "17:00", effectiveFrom: null }],
      gC.id,
    ),
    () => null,
  );

  await mustPass(
    "o'z guruhi bilan o'zi to'qnashmaydi (excludeGroupId)",
    () => tgp.assertTeacherScheduleFree(
      band.id,
      [{ day: "mon", startTime: "09:00", endTime: "10:30", effectiveFrom: null }],
      gA.id,
    ),
    () => null,
  );

  await mustPass(
    "bo'sh o'qituvchida to'qnashuv yo'q",
    () => tgp.assertTeacherScheduleFree(
      bosh.id,
      [{ day: "mon", startTime: "09:00", endTime: "10:30", effectiveFrom: null }],
      null,
    ),
    () => null,
  );

  // ── 2) BO'SH O'QITUVCHILAR ───────────────────────────────────────
  console.log("\n2) bo'sh o'qituvchilar ro'yxati");

  await mustPass(
    "B guruh uchun band o'qituvchi ro'yxatdan chiqadi",
    () => tgp.listAvailableTeachers(gB.id),
    (rows) => {
      const ids = rows.map((r) => r.id);
      if (ids.includes(band.id)) return "band o'qituvchi bo'sh deb ko'rsatildi";
      if (!ids.includes(bosh.id)) return "bo'sh o'qituvchi ro'yxatda yo'q";
      if (!rows.every((r) => r._id)) return "_id taxallusi yo'q";
      return null;
    },
  );

  await mustPass(
    "C guruh (to'qnashmaydigan vaqt) uchun ikkalasi ham bo'sh",
    () => tgp.listAvailableTeachers(gC.id),
    (rows) => {
      const ids = rows.map((r) => r.id);
      return ids.includes(band.id) && ids.includes(bosh.id)
        ? null
        : "to'qnashmasa ham band deb ko'rsatildi";
    },
  );

  // ── 3) REZOLVERLAR ───────────────────────────────────────────────
  console.log("\n3) davr rezolverlari");

  await mustPass(
    "activeTeacherIdsForGroup faqat OCHIQ davrni beradi",
    () => tgp.activeTeacherIdsForGroup(gA.id),
    (ids) => {
      if (!ids.includes(band.id)) return "ochiq davr egasi topilmadi";
      if (ids.includes(bosh.id)) return "yopilgan davr ham aktiv deb sanaldi";
      return null;
    },
  );

  await mustPass(
    "activeTeacherIdsForGroup o'tgan sanada eski o'qituvchini beradi",
    () => tgp.activeTeacherIdsForGroup(gA.id, new Date("2024-01-15")),
    (ids) => {
      if (!ids.includes(bosh.id)) return "o'sha sanadagi o'qituvchi topilmadi";
      if (ids.includes(band.id)) return "hali boshlanmagan davr sanaldi";
      return null;
    },
  );

  await mustPass(
    "activeGroupIdsForTeacher guruhni topadi",
    () => tgp.activeGroupIdsForTeacher(band.id),
    (ids) => (ids.includes(gA.id) ? null : "guruh topilmadi"),
  );

  await mustPass(
    "teacherPeriodsActiveInMonth `teacher` moslashtiruvini saqlaydi",
    () => tgp.teacherPeriodsActiveInMonth(gA.id, 2024, 3),
    (rows) => {
      const mine = rows.find((r) => String(r.teacher) === band.id);
      if (!mine) return "davr topilmadi yoki `teacher` maydoni yo'q";
      if (!mine._id) return "_id moslashtiruvi yo'q";
      // Yanvarda yopilgan davr martda kesishmasligi kerak.
      if (rows.some((r) => String(r.teacher) === bosh.id)) {
        return "oydan tashqaridagi davr ham qaytdi";
      }
      return null;
    },
  );

  await mustPass(
    "periodsForMonth stavka maydonlarini beradi",
    () => tgp.periodsForMonth(band.id, gA.id, 2024, 3),
    (rows) => {
      if (rows.length !== 1) return `${rows.length} ta davr qaytdi`;
      const r = rows[0];
      if (!("salaryType" in r) || !("variableType" in r)) return "stavka maydonlari yo'q";
      return null;
    },
  );

  await mustPass(
    "listByGroup o'qituvchini populate qiladi",
    () => tgp.listByGroup(gA.id),
    (rows) => {
      if (rows.length !== 2) return `${rows.length} ta davr`;
      if (!rows[0].teacher?.firstName) return "o'qituvchi yuklanmadi";
      if (!rows[0]._id) return "_id taxallusi yo'q";
      // desc tartib: yangi davr birinchi.
      if (new Date(rows[0].startDate) < new Date(rows[1].startDate)) {
        return "tartib desc emas";
      }
      return null;
    },
  );

  // ── 4) TEACHERS KESHI (ko'p-ko'pga) ──────────────────────────────
  console.log("\n4) Group.teachers keshi (ko'p-ko'pga bog'lanish)");

  await mustPass(
    "syncGroupTeachersCache aktivlarni yozadi",
    async () => {
      await tgp.syncGroupTeachersCache(gA.id);
      return prisma.group.findUnique({
        where: { id: gA.id },
        select: { teachers: { select: { id: true } } },
      });
    },
    (g) => {
      const ids = g.teachers.map((t) => t.id);
      if (ids.length !== 1) return `${ids.length} ta o'qituvchi yozildi`;
      if (ids[0] !== band.id) return "noto'g'ri o'qituvchi";
      return null;
    },
  );

  await mustPass(
    "davr yopilgach kesh TO'LIQ almashtiriladi (set)",
    async () => {
      await prisma.teacherGroupPeriod.update({
        where: { id: openPeriod.id },
        data: { endDate: new Date("2024-03-01") },
      });
      await tgp.syncGroupTeachersCache(gA.id);
      const g = await prisma.group.findUnique({
        where: { id: gA.id },
        select: { teachers: { select: { id: true } } },
      });
      // Keyingi testlar uchun tiklaymiz.
      await prisma.teacherGroupPeriod.update({
        where: { id: openPeriod.id },
        data: { endDate: null },
      });
      await tgp.syncGroupTeachersCache(gA.id);
      return g;
    },
    (g) => (g.teachers.length === 0 ? null : "eski kesh qatori qoldi"),
  );

  await mustPass(
    "kesh orqali qidiruv ishlaydi (`teachers: { some }`)",
    () => prisma.group.count({
      where: { id: gA.id, teachers: { some: { id: band.id } } },
    }),
    (n) => (n === 1 ? null : "ko'p-ko'pga filtri topmadi"),
  );

  // ── 5) BOT HOLATI (BigInt) ───────────────────────────────────────
  console.log("\n5) bot holati va BigInt seriyalash");

  const bot = await prisma.botUser.create({
    data: {
      telegramId: BigInt("123456789012"),
      chatId: BigInt("123456789012"),
      userId: band.id,
      username: "bandustoz",
    },
  });
  created.bots.push(bot.id);

  await mustPass(
    "attachBotStatus Prisma obyektiga (`id`) ishlaydi",
    async () => {
      const rows = [{ id: band.id }, { id: bosh.id }];
      await attachBotStatus(rows);
      return rows;
    },
    (rows) => {
      if (rows[0].botStatus !== BOT_STATUS.LINKED) return `botStatus=${rows[0].botStatus}`;
      if (typeof rows[0].telegram?.telegramId !== "number") return "telegramId raqam emas";
      if (rows[1].botStatus !== BOT_STATUS.NOT_LINKED) return "ulanmagan noto'g'ri";
      if (rows[1].telegram !== null) return "ulanmaganda telegram null emas";
      return null;
    },
  );

  await mustPass(
    "javob JSON'ga seriyalanadi (BigInt 500 bermaydi)",
    async () => {
      const rows = [{ id: band.id }];
      await attachBotStatus(rows);
      return JSON.stringify(rows);
    },
    (s) => (s.includes("123456789012") ? null : "telegramId javobda yo'q"),
  );

  await mustPass(
    "eski (`_id`) shakldagi obyekt ham ishlaydi",
    async () => {
      const rows = [{ _id: band.id }];
      await attachBotStatus(rows);
      return rows;
    },
    (rows) => (rows[0].botStatus === BOT_STATUS.LINKED ? null : "eski shakl topilmadi"),
  );

  // ── 6) CASCADE SOFT-DELETE ───────────────────────────────────────
  console.log("\n6) cascade soft-delete");

  const student = await prisma.user.create({
    data: {
      firstName: "Talaba", lastName: "Cascade",
      username: `casc_${SUFFIX}`, passwordHash: "x",
      role: ROLES.STUDENT, homeBranchId: branch.id,
    },
  });
  created.users.push(student.id);
  await prisma.groupMembership.create({
    data: { groupId: gC.id, studentId: student.id },
  });

  await mustPass(
    "deleteGroup guruh VA a'zolikni belgilaydi",
    async () => {
      await deleteGroup(gC.id, { id: band.id });
      return {
        group: await prisma.group.findUnique({
          where: { id: gC.id }, select: { isDeleted: true, deletedBy: true },
        }),
        mem: await prisma.groupMembership.count({
          where: { groupId: gC.id, isDeleted: true },
        }),
      };
    },
    (r) => {
      if (!r.group.isDeleted) return "guruh belgilanmadi";
      if (r.group.deletedBy !== band.id) return "deletedBy yozilmadi";
      if (r.mem !== 1) return "a'zolik belgilanmadi";
      return null;
    },
  );

  await mustPass(
    "restoreGroup ikkalasini ham tiklaydi",
    async () => {
      await restoreGroup(gC.id);
      return {
        group: await prisma.group.findUnique({
          where: { id: gC.id }, select: { isDeleted: true, deletedBy: true },
        }),
        mem: await prisma.groupMembership.count({
          where: { groupId: gC.id, isDeleted: false },
        }),
      };
    },
    (r) => {
      if (r.group.isDeleted) return "guruh tiklanmadi";
      if (r.group.deletedBy !== null) return "deletedBy tozalanmadi";
      if (r.mem !== 1) return "a'zolik tiklanmadi";
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
