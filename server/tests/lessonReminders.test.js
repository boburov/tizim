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
import mongoose from "mongoose";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_lesson_reminder_test";

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

const run = async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  const Branch = (await import("../src/models/branch.model.js")).default;
  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const Notification = (await import("../src/models/notification.model.js")).default;
  const Holiday = (await import("../src/models/holiday.model.js")).default;
  const LessonCancellation = (await import("../src/models/lessonCancellation.model.js")).default;
  const StudentFreeze = (await import("../src/models/studentFreeze.model.js")).default;

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

  const branch = await Branch.create({ name: "Asosiy filial", isMain: true });

  const mkStudent = async (name) =>
    User.create({
      firstName: name,
      lastName: "Test",
      username: name.toLowerCase(),
      passwordHash: "x",
      role: "student",
      homeBranchId: branch._id,
      isActive: true,
    });

  // Bugun darsi bor guruh (jadval BUGUNGI hafta kunida).
  const mkGroup = async (name) =>
    Group.create({
      branchId: branch._id,
      name,
      isActive: true,
      startDate: yesterday,
      schedule: [{ day: dow, startTime: "09:00", endTime: "10:30" }],
    });

  const gA = await mkGroup("GURUH-A");
  const gB = await mkGroup("GURUH-B");

  const normal = await mkStudent("Normal");
  const frozen = await mkStudent("Frozen");
  const twoGroups = await mkStudent("TwoGroups");
  const inactive = await mkStudent("Inactive");
  await User.updateOne({ _id: inactive._id }, { $set: { isActive: false } });

  const join = (student, group) =>
    GroupMembership.create({ student: student._id, group: group._id, joinedAt: yesterday });

  await join(normal, gA);
  await join(frozen, gA);
  await join(inactive, gA);
  await join(twoGroups, gA);
  await join(twoGroups, gB);

  await StudentFreeze.create({
    student: frozen._id,
    startDate: new Date(today.getTime() - 24 * 60 * 60 * 1000),
    endDate: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
  });

  const notifFor = async (student) =>
    Notification.findOne({ dedupeKey: `lesson-reminder:${student._id}:${dayKey}` }).lean();

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
  const dupes = await Notification.countDocuments({
    dedupeKey: `lesson-reminder:${normal._id}:${dayKey}`,
  });
  check("dublikat yaratilmadi", dupes === 1, `${dupes} ta xabar bor`);

  // ─── 5. Bekor qilingan dars ───
  head("5) Dars bekor qilingan kun");
  await Notification.deleteMany({});
  await LessonCancellation.create({
    group: gA._id,
    date: today,
    dateKey: dayKey,
    slot: "",
    reason: "teacher_absent",
  });
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
  await Notification.deleteMany({});
  await LessonCancellation.deleteMany({});
  // Holiday - takrorlanuvchi (oy/kun) modeli, aniq sana emas.
  await Holiday.create({
    name: "Test bayram",
    message: "Bayramingiz muborak",
    month: today.getUTCMonth() + 1,
    day: today.getUTCDate(),
    isRecurring: true,
    isActive: true,
  });
  // Bayramlar ro'yxati xotirada keshlanadi (TTL bilan). Test ichida
  // yangi bayram qo'shilgani uchun keshni majburan bo'shatamiz - aks
  // holda job hali eski, bo'sh ro'yxatni ko'rardi.
  invalidateHolidayCache();
  const res6 = await runLessonReminders();
  check("hech kimga xabar ketmadi", res6.sent === 0, `${res6.sent} ta yuborildi`);

  console.log(`\n\x1b[1mNATIJA\x1b[0m  ${R.pass} o'tdi, ${R.fail} yiqildi`);
  for (const f of R.failures) console.log(`  \x1b[31m•\x1b[0m ${f}`);
  console.log(`\x1b[2m  (1-yugurishda: ${res1.sent} yuborildi, ${res1.skipped} o'tkazildi)\x1b[0m`);

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(R.fail ? 1 : 0);
};

run().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ulanish yo'q */
  }
  process.exit(1);
});
