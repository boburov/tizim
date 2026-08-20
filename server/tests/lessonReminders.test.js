/**
 * ERTALABKI DARS ESLATMASI.
 *
 * SAVOL: "Bugun darsi borlarga xabar ketdi - demak to'g'ri, shundaymi?"
 *
 * YO'Q. Eslatmaning qiymati YUBORILGANIDA emas, KIMGA yuborilmaganida:
 * bayram kuni, bekor qilingan dars yoki muzlatilgan o'quvchiga ketgan
 * xabar odamni behuda yo'lga chiqaradi va tizimga ishonchni yo'qotadi.
 *
 * Shuning uchun bu test asosan RAD ETISHNI tekshiradi.
 *
 * O'Z BAZASIDA ishlaydi (lc_lesson_reminder_test) va oxirida o'chiradi.
 *
 * ISHLATISH:  npm run test:lesson-reminder
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { createFixtures } from "./helpers/prismaFixtures.js";

/**
 * ── PRISMA'GA KO'CHIRISHDA NIMA O'ZGARDI ──
 *
 * 1) IZOLYATSIYA. Alohida Mongo bazasi + `dropDatabase()` o'rniga
 *    prefiksli fixture va kafolatli tozalash.
 *
 * 2) ⚠⚠ JOBNI CHEKLASH — ENG MUHIM O'ZGARISH ⚠⚠
 *
 *    `runLessonReminders()` argument OLMAYDI va filial ko'lami YO'Q —
 *    u ATAYLAB global (rejali ish butun markaz bo'ylab yuguradi).
 *
 *    Bo'sh Mongo bazasida bu xavfsiz edi: fixture'dan boshqa hech narsa
 *    yo'q. HAQIQIY dev bazasida esa job BUGUN darsi bor BARCHA guruhni
 *    topadi, real o'quvchilarga eslatma yaratadi VA telegram push'ini
 *    NAVBATGA QO'YADI — server ishlab tursa xabar haqiqatan ketardi.
 *
 *    Shuning uchun job yugurayotgan paytda `prisma.group.findMany`
 *    vaqtincha TORAYTIRILADI: `where` ga `id: { in: <fixture guruhlari> }`
 *    qo'shiladi. Bu jobning O'Z mantig'ini (jadval, muzlatish, bekor
 *    qilish, bayram) BUZMAYDI — u faqat KO'RINADIGAN olamni fixture
 *    bilan cheklaydi. Tekshiruvlar baribir aniq o'quvchilar bo'yicha.
 *
 * 3) Bo'lim 5-6 dagi `Notification.deleteMany({})` — BUTUN jadvalni
 *    tozalardi. Endi faqat SHU test yaratgan eslatmalar o'chiriladi.
 */

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const fx = createFixtures();
let restoreGroupFind = () => {};

const run = async () => {
  const { runLessonReminders } = await import("../src/jobs/lessonReminders.job.js");
  const { invalidateHolidayCache } = await import(
    "../src/modules/holidays/services/holidays.service.js"
  );
  const { localTodayMidnight, localDayOfWeek, localTodayKey } = await import(
    "../src/helpers/attendance.helper.js"
  );

  const today = localTodayMidnight();
  const dow = localDayOfWeek();
  const dayKey = localTodayKey();
  const yesterday = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const branch = await fx.branch("LR-filial");

  const mkStudent = async (name) =>
    fx.user(name.toLowerCase(), {
      firstName: name,
      lastName: "Test",
      passwordHash: "x",
      role: "student",
      homeBranchId: branch.id,
      isActive: true,
    });

  // Bugun darsi bor guruh (jadval BUGUNGI hafta kunida).
  const mkGroup = async (name) =>
    fx.group(name, branch.id, {
      isActive: true,
      startDate: yesterday,
      schedule: { create: [{ day: dow, startTime: "09:00", endTime: "10:30" }] },
    });

  const gA = await mkGroup("GURUH-A");
  const gB = await mkGroup("GURUH-B");
  const fixtureGroupIds = [gA.id, gB.id];

  const normal = await mkStudent("Normal");
  const frozen = await mkStudent("Frozen");
  const twoGroups = await mkStudent("TwoGroups");
  const inactive = await mkStudent("Inactive");
  await prisma.user.update({ where: { id: inactive.id }, data: { isActive: false } });

  const join = (student, group) => fx.membership(group.id, student.id, { joinedAt: yesterday });

  await join(normal, gA);
  await join(frozen, gA);
  await join(inactive, gA);
  await join(twoGroups, gA);
  await join(twoGroups, gB);

  const freeze = await prisma.studentFreeze.create({
    data: {
      studentId: frozen.id,
      startDate: new Date(today.getTime() - 24 * 60 * 60 * 1000),
      endDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  fx.track("studentFreeze", freeze.id);

  // ── JOBNI FIXTURE GURUHLARI BILAN CHEKLASH (yuqoridagi izohga qarang) ──
  const realGroupFindMany = prisma.group.findMany.bind(prisma.group);
  restoreGroupFind = () => {
    prisma.group.findMany = realGroupFindMany;
  };
  prisma.group.findMany = (args = {}) =>
    realGroupFindMany({
      ...args,
      where: { ...(args.where || {}), id: { in: fixtureGroupIds } },
    });

  const dedupeKeyFor = (student) => `lesson-reminder:${student.id}:${dayKey}`;
  /** Job yaratgan eslatmalar ham tozalanishi kerak — reyestrga olamiz. */
  const notifFor = async (student) => {
    const n = await prisma.notification.findFirst({
      where: { dedupeKey: dedupeKeyFor(student) },
    });
    if (n) fx.track("notification", n.id);
    return n;
  };
  /** SHU test yaratgan eslatmalarni o'chiradi (butun jadvalni EMAS). */
  const clearFixtureNotifications = async () => {
    const keys = [normal, frozen, twoGroups, inactive].map(dedupeKeyFor);
    const rows = await prisma.notification.findMany({
      where: { dedupeKey: { in: keys } },
      select: { id: true },
    });
    const ids = rows.map((r) => r.id);
    if (!ids.length) return;
    await prisma.notificationRecipient.deleteMany({ where: { notificationId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  };

  // ─── 1. Oddiy holat ───
  head("1) Bugun darsi bor o'quvchi");
  const res1 = await runLessonReminders();
  const n1 = await notifFor(normal);
  check("eslatma yaratildi", Boolean(n1), "xabar yo'q");
  check(
    "matnda guruh va vaqt bor",
    Boolean(n1) && n1.body.includes("GURUH-A") && n1.body.includes("09:00"),
    `matn: ${n1?.body}`,
  );

  head("2) Ikki guruhda o'qiydigan o'quvchi");
  const n2 = await notifFor(twoGroups);
  check("BITTA xabar oldi", Boolean(n2), "xabar yo'q");
  check(
    "ikkala guruh bitta xabarda",
    Boolean(n2) && n2.body.includes("GURUH-A") && n2.body.includes("GURUH-B"),
    `matn: ${n2?.body}`,
  );

  head("3) Yuborilmasligi kerak bo'lganlar");
  check("muzlatilgan o'quvchiga YO'Q", !(await notifFor(frozen)), "xabar ketdi!");
  check("faol bo'lmagan o'quvchiga YO'Q", !(await notifFor(inactive)), "xabar ketdi!");

  // ─── 4. Takroriy ishga tushirish ───
  head("4) Job qayta ishga tushsa (deploy / qayta urinish)");
  await runLessonReminders();
  const dupes = await prisma.notification.count({
    where: { dedupeKey: dedupeKeyFor(normal) },
  });
  check("dublikat yaratilmadi", dupes === 1, `${dupes} ta xabar bor`);

  // ─── 5. Bekor qilingan dars ───
  head("5) Dars bekor qilingan kun");
  await clearFixtureNotifications();
  const cancellation = await prisma.lessonCancellation.create({
    data: {
      groupId: gA.id,
      date: today,
      dateKey: dayKey,
      slot: "",
      reason: "teacher_absent",
    },
  });
  fx.track("lessonCancellation", cancellation.id);
  await runLessonReminders();
  const afterCancel = await notifFor(normal);
  check("faqat GURUH-A da o'qiyotganga YO'Q", !afterCancel, "bekor qilingan darsga chaqirildi!");
  const stillTwo = await notifFor(twoGroups);
  check(
    "GURUH-B qolgani uchun ikkinchisiga BOR",
    Boolean(stillTwo) && !stillTwo.body.includes("GURUH-A"),
    stillTwo ? `matn: ${stillTwo.body}` : "xabar yo'q",
  );

  // ─── 6. Bayram ───
  head("6) Bayram kuni");
  await clearFixtureNotifications();
  await prisma.lessonCancellation.delete({ where: { id: cancellation.id } });
  // Holiday - takrorlanuvchi (oy/kun) modeli, aniq sana emas.
  const holiday = await prisma.holiday.create({
    data: {
      name: `Test bayram ${fx.suffix}`,
      message: "Bayramingiz muborak",
      month: today.getUTCMonth() + 1,
      day: today.getUTCDate(),
      isRecurring: true,
      isActive: true,
    },
  });
  fx.track("holiday", holiday.id);
  // Bayramlar ro'yxati xotirada keshlanadi (TTL bilan). Test ichida
  // yangi bayram qo'shilgani uchun keshni majburan bo'shatamiz - aks
  // holda job hali eski, bo'sh ro'yxatni ko'rardi.
  invalidateHolidayCache();
  const res6 = await runLessonReminders();
  check("hech kimga xabar ketmadi", res6.sent === 0, `${res6.sent} ta yuborildi`);

  console.log(`\x1b[2m  (1-yugurishda: ${res1.sent} yuborildi, ${res1.skipped} o'tkazildi)\x1b[0m`);
  await clearFixtureNotifications();
};

run()
  .catch((err) => {
    bad("TEST YIQILDI", err?.message || String(err));
    if (process.env.DEBUG) console.error(err);
  })
  .finally(async () => {
    restoreGroupFind();
    const problems = await fx.cleanup();
    const leftovers = await fx.assertClean();
    if (problems.length) bad("fixture tozalash", problems.join(" · "));
    else if (leftovers.length) bad("fixture tozalash to'liq emas", leftovers.join(" · "));
    else ok(`fixture tozalandi (${fx.suffix})`);

    console.log(`\n\x1b[1mNATIJA\x1b[0m  ${R.pass} o'tdi, ${R.fail} yiqildi`);
    for (const f of R.failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);
    await prisma.$disconnect().catch(() => {});
    process.exit(R.fail ? 1 : 0);
  });
