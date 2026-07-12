import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import { hashPassword } from "../helpers/password.helper.js";
import { ROLES } from "../constants/roles.js";
import User from "../models/user.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import * as groupsService from "../modules/groups/services/groups.service.js";
import * as groupFeeService from "../modules/finance/services/groupFee.service.js";
import * as paymentService from "../modules/finance/services/studentPayment.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// DEMO GURUH: kurs narxi 1.5 mln, 10 o'quvchi, ~1.5 oydan beri o'qiydi.
// Service qatlami orqali izchil yaratiladi: guruh + o'qituvchi davri + oylik
// to'lovlar (GroupFee) + a'zoliklar + avtomatik to'lov accrual (qarz).
// Ishga tushirish:  node src/seeds/demoGroup.seed.js
// ─────────────────────────────────────────────────────────────────────────────

const MONTHLY_PRICE = 1_500_000;
const STUDENT_COUNT = 10;
const COMMON_PASSWORD = "parol123";
const TAG = Date.now().toString(36).slice(-4);

const FIRST = [
  "Ali", "Aziza", "Bekzod", "Dilnoza", "Doniyor", "Madina", "Sardor",
  "Nilufar", "Otabek", "Sevara", "Jasur", "Mohinur", "Rustam", "Zarina",
];
const LAST = [
  "Karimov", "Olimova", "Rashidov", "Yusupova", "Ergashev", "Saidova",
  "Mahmudov", "Ahmedova", "Qodirov", "Ismoilova", "Tursunov", "Sharipova",
];
const pick = (a, i) => a[i % a.length];
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const seed = async () => {
  await connectDB();

  // ~1.5 oy (45 kun) oldin - guruh boshlangan / o'quvchilar qo'shilgan sana.
  const startDate = daysAgo(45);
  const passwordHash = await hashPassword(COMMON_PASSWORD);

  // 1) O'qituvchi (guruh boshlanishidan oldin ishga olingan bo'lishi shart).
  const teacher = await User.create({
    firstName: "Sardor",
    lastName: "Ustoz",
    username: `demo_teacher_${TAG}`,
    phone: `+99890${String(1000000 + Math.floor(Math.random() * 8999999)).slice(-7)}`,
    passwordHash,
    role: ROLES.TEACHER,
    hiredAt: daysAgo(75),
    isActive: true,
  });

  // 2) Guruh: jadval Du/Chor/Juma 15:00-17:00, narx 1.5 mln, o'qituvchi biriktirilgan.
  const group = await groupsService.create({
    name: `Ingliz tili — Demo (${TAG})`,
    schedule: [
      { day: "mon", startTime: "15:00", endTime: "17:00" },
      { day: "wed", startTime: "15:00", endTime: "17:00" },
      { day: "fri", startTime: "15:00", endTime: "17:00" },
    ],
    startDate,
    durationMonths: 6,
    teachers: [teacher._id],
    monthlyPrice: MONTHLY_PRICE,
  });

  // 3) Guruh boshlangan oydan bugungacha har bir oy uchun 1.5 mln to'lov belgilaymiz
  //    (create faqat joriy oyni belgilaydi - o'tgan oylar uchun ham kerak).
  const now = new Date();
  const months = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  while (cur <= end) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() + 1 });
    cur.setMonth(cur.getMonth() + 1);
  }
  for (const { year, month } of months) {
    await groupFeeService.upsert({
      groupId: group._id,
      year,
      month,
      amount: MONTHLY_PRICE,
    });
  }

  // 4) 10 o'quvchi yaratamiz (~1.5 oy oldin ro'yxatga olingan).
  const students = [];
  for (let i = 0; i < STUDENT_COUNT; i += 1) {
    const s = await User.create({
      firstName: pick(FIRST, i),
      lastName: pick(LAST, i),
      username: `demo_student_${TAG}_${i + 1}`,
      phone: `+99893${String(2000000 + i + Math.floor(Math.random() * 5000000)).slice(-7)}`,
      passwordHash,
      role: ROLES.STUDENT,
      enrolledAt: startDate,
      gender: i % 2 === 0 ? "male" : "female",
      isActive: true,
    });
    students.push(s);
  }

  // 5) O'quvchilarni guruhga qo'shamiz (joinedAt = boshlanish sanasi). Bu har bir
  //    a'zolik uchun oylar bo'yicha to'lov (qarz) yozuvlarini yaratadi.
  const res = await groupsService.addStudentsBulk(
    group._id,
    students.map((s) => s._id),
    { joinedAt: startDate, force: true },
  );

  // 6) To'lovlarni bugungi holatga qadar hisoblaymiz (dars-asosli accrual).
  for (const s of students) {
    await paymentService.recalcForStudent(s._id);
  }

  // ── Xulosa ──
  const payments = await StudentPayment.find({ group: group._id }).lean();
  const expected = payments.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const paid = payments.reduce((s, p) => s + (p.paidAmount || 0), 0);

  logger.info("✅ DEMO GURUH yaratildi");
  logger.info(`   Guruh:     ${group.name}  (id: ${group._id})`);
  logger.info(`   O'qituvchi: ${teacher.firstName} ${teacher.lastName}  (@${teacher.username})`);
  logger.info(`   Jadval:    Du / Chor / Juma  15:00–17:00`);
  logger.info(`   Boshlangan: ${startDate.toISOString().slice(0, 10)}  (~1.5 oy oldin)`);
  logger.info(`   Oylik narx: ${MONTHLY_PRICE.toLocaleString("ru-RU")} so'm`);
  logger.info(`   O'quvchilar: qo'shildi ${res.added.length}, xato ${res.failed.length}`);
  logger.info(`   To'lov yozuvlari: ${payments.length} ta (${months.length} oy)`);
  logger.info(`   Jami kutilgan qarz: ${expected.toLocaleString("ru-RU")} so'm  |  to'langan: ${paid.toLocaleString("ru-RU")}`);
  logger.info(`   Barcha login parollari: ${COMMON_PASSWORD}`);
  if (res.failed.length) logger.warn({ failed: res.failed }, "Ba'zi o'quvchilar qo'shilmadi");

  await disconnectDB();
  process.exit(0);
};

seed().catch(async (err) => {
  logger.error({ err }, "Demo guruh seed xatosi");
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
