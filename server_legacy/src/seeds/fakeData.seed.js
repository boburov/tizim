import "dotenv/config";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";
import { hashPassword } from "../helpers/password.helper.js";
import { ROLES } from "../constants/roles.js";

// Sonlarni env orqali kichraytirsa bo'ladi (demo uchun): SEED_TEACHERS=5 ...
const TEACHER_COUNT = Number(process.env.SEED_TEACHERS) || 40;
const STUDENT_COUNT = Number(process.env.SEED_STUDENTS) || 800;
const GROUP_COUNT = Number(process.env.SEED_GROUPS) || 40;
const COMMON_PASSWORD = "parol123";
const RUN_TAG = Date.now().toString(36);
const PHONE_BASE = parseInt(RUN_TAG.slice(-6), 36) % 9000000;

const DIRECTIONS = [
  "Matematika",
  "Ingliz tili",
  "Rus tili",
  "Informatika",
  "Fizika",
  "Kimyo",
];

const MONTHS = [
  { year: 2025, month: 6 }, { year: 2025, month: 7 }, { year: 2025, month: 8 },
  { year: 2025, month: 9 }, { year: 2025, month: 10 }, { year: 2025, month: 11 },
  { year: 2025, month: 12 },
  { year: 2026, month: 1 }, { year: 2026, month: 2 }, { year: 2026, month: 3 },
  { year: 2026, month: 4 }, { year: 2026, month: 5 },
];

const MALE_FIRST = [
  "Ali", "Vali", "Akmal", "Bekzod", "Doniyor", "Sherzod", "Sardor", "Jasur",
  "Otabek", "Sirojiddin", "Husan", "Hasan", "Anvar", "Botir", "Davron", "Eldor",
  "Farrux", "Habib", "Ibrohim", "Javlon", "Karim", "Laziz", "Murod", "Nodir",
  "Olim", "Rustam", "Sanjar", "Temur", "Ulug'bek", "Yusuf",
];
const FEMALE_FIRST = [
  "Aziza", "Dilnoza", "Madina", "Nodira", "Saodat", "Zarina", "Gulnora",
  "Mohinur", "Komila", "Lola", "Maftuna", "Nilufar", "Sevara", "Zilola", "Asal",
  "Barno", "Charos", "Dilshoda", "Elnura", "Farangiz", "Gulchehra", "Hilola",
  "Iroda", "Kamola", "Latofat", "Mahliyo", "Nigora", "Rayhona", "Shahnoza",
  "Umida",
];
const LAST_NAMES = [
  "Karimov", "Olimov", "Rashidov", "Yusupov", "Hamidov", "Toshmatov", "Saidov",
  "Ergashev", "Mahmudov", "Ahmedov", "Murodov", "Rahmonov", "Tursunov",
  "Norqulov", "Sharipov", "Sodiqov", "Qodirov", "Ismoilov", "Xolmatov",
  "Mirzayev", "Abdullayev", "Boboyev", "Davlatov", "Eshmatov", "Fayziyev",
  "Hojiyev", "Komilov", "Nazarov", "Qosimov", "Rajabov", "Sobirov", "Umarov",
  "Vohidov", "Yo'ldoshev", "Zoirov", "Nematov", "Salimov", "Yo'lchiyev",
  "G'aniyev", "Po'latov",
];
const CITIES = [
  "Toshkent", "Samarqand", "Buxoro", "Andijon", "Farg'ona", "Namangan",
  "Nukus", "Qarshi", "Jizzax", "Navoiy",
];
const STREETS = [
  "Mustaqillik", "Amir Temur", "Navoiy", "Bobur", "A.Qodiriy", "Furqat",
  "Yusuf Xos Hojib", "Cho'lpon",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDate = (from, to) =>
  new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()));

const weighted = (items) => {
  const total = items.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of items) {
    r -= w.weight;
    if (r <= 0) return w.value;
  }
  return items[items.length - 1].value;
};

const monthStart = (y, m) => new Date(y, m - 1, 1);
const monthEnd = (y, m) => new Date(y, m, 0, 23, 59, 59, 999);
const fmtTime = (h, mi) =>
  `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;

const genPhone = (idx) => {
  const op = pick(["90", "91", "93", "94", "95", "97", "99", "33"]);
  const num = String((PHONE_BASE + idx) % 10000000).padStart(7, "0");
  return `+998${op}${num}`;
};

const genUsername = (prefix, idx) => `${prefix}_${idx}_${RUN_TAG}`;

const genSchedule = () => {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const count = randInt(2, 3);
  const picked = [...days].sort(() => Math.random() - 0.5).slice(0, count);
  const startHour = randInt(14, 18);
  return picked.map((day) => ({
    day,
    startTime: fmtTime(startHour, 0),
    endTime: fmtTime(startHour + 2, 0),
  }));
};

// `insertMany` ning o'rni. Mongo'dan asosiy FARQ: `createMany` yozilgan
// QATORLARNI qaytarmaydi, faqat sonini. `id` kerak bo'lgan joyda
// (foydalanuvchi) qatorlar keyin alohida o'qiladi - `attachIds()`.
const bulkCreate = async (model, docs, chunkSize = 1000) => {
  let count = 0;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const res = await prisma[model].createMany({ data: docs.slice(i, i + chunkSize) });
    count += res.count;
  }
  return count;
};

// Yozilgan foydalanuvchilarga `id` ni QAYTA BIRIKTIRADI.
//
// TARTIB SAQLANADI: guruhga o'qituvchi indeks bo'yicha biriktiriladi
// (`teachers[i]`), shuning uchun natija bazadan kelgan tartibda emas,
// KIRISH massivi tartibida qurilishi shart. `username` unique, ya'ni
// xaritalash bir qiymatli.
const attachIds = async (docs) => {
  const rows = await prisma.user.findMany({
    where: { username: { in: docs.map((d) => d.username) } },
    select: { id: true, username: true },
  });
  const idByUsername = new Map(rows.map((r) => [r.username, r.id]));
  return docs.map((d) => ({ ...d, id: idByUsername.get(d.username) }));
};

const seed = async () => {
  await connectDB();
  const startedAt = Date.now();

  const owner = await prisma.user.findFirst({ where: { role: ROLES.OWNER } });
  if (!owner) {
    throw new Error("Owner yo'q. Avval `npm run seed:owner` ishga tushiring.");
  }

  // FILIAL - seed filial migratsiyasidan OLDIN yozilgan, shuning uchun
  // guruhlarni branchId'siz yaratardi va `Group` validatsiyasi yiqilardi.
  // Filial endi majburiy: bitta "Asosiy filial" ta'minlanadi va barcha
  // foydalanuvchi/guruh shunga biriktiriladi. Idempotent - qayta ishga
  // tushirilsa mavjudini oladi.
  let branch = await prisma.branch.findFirst({ where: { isMain: true, isDeleted: false } });
  if (!branch) {
    branch = await prisma.branch.create({ data: {
      name: "Asosiy filial",
      code: "MAIN",
      isMain: true,
      isActive: true,
    } });
  }
  // Owner ham filialga bog'lanadi - aks holda u kirganda "filial tanlang"
  // holatida qolib ketadi va AI bashorati (filialga bog'liq) ishlamaydi.
  if (!owner.homeBranchId) {
    await prisma.user.update({ where: { id: owner.id }, data: { homeBranchId: branch.id } });
  }

  // --- ESKI DEMO MA'LUMOTNI TOZALASH (idempotent qayta ishga tushirish) ---
  //
  // NEGA KERAK: seed ilgari faqat QO'SHARDI. Ikkinchi marta ishga
  // tushirilsa 800 o'quvchi 1600 bo'lardi, guruhlar ikkilanardi va AI
  // analitikasi ma'nosiz sonlar ustida ishlardi. multiBranchDemo.seed.js
  // allaqachon shu naqshni qo'llaydi.
  //
  // SAQLANADI: owner, rollar, ruxsatlar, bildirishnoma shablonlari.
  // O'CHIRILADI: faqat demo o'quvchi/o'qituvchi va ularga bog'liq yozuvlar.
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠ TOZALASH: FK TARTIBI MAJBURIY, QAMROVI ESA CHEKLANGAN.
  //
  // Mongo'da tashqi kalit yo'q edi: `User.deleteMany({role: student|teacher})`
  // darhol ishlardi va unga ishora qiluvchi to'lov/maosh yozuvlari YETIM
  // qolardi. PostgreSQL bunga yo'l qo'ymaydi - 34 ta jadval `RESTRICT` bilan
  // o'chirishni to'sadi.
  //
  // IKKI XIL TO'SIQ BOR:
  //
  //   1) RESTRICT — bola bo'lsa ota o'chmaydi (aniq xato).
  //   2) SET NULL + CHECK — JIMROQ va shu sababli xavfliroq. Masalan
  //      `teacher_salaries.groupId` guruh o'chganda NULL ga tushadi, lekin
  //      `teacher_salaries_kind_group_check` `kind='group'` qatoridan
  //      groupId NOT NULL bo'lishini talab qiladi. Natijada `group.deleteMany()`
  //      23514 bilan yiqiladi - garchi guruhga TO'G'RIDAN-TO'G'RI hech narsa
  //      tayanmasa ham.
  //
  // NEGA HAMMASINI TOZALAMAYMIZ: to'siqlar yopilishi 34 jadvalni qamraydi
  // (`shifts`, `staff_payrolls`, `refunds`, `expense_approvals`...). Ularni
  // ko'r-ko'rona bo'shatish bu seed'ning ishi EMAS - u faqat o'quv demo
  // ma'lumotini qayta quradi. Shuning uchun har bir o'chirish AYNAN
  // o'chirilayotgan foydalanuvchi/guruhga BOG'LANGAN qatorlar bilan
  // cheklanadi. Boshqa seed (financeDemo) va QA fixture ma'lumoti tegilmaydi.
  //
  // Ya'ni qamrov Mongo davridagidek: o'sha o'quvchi/o'qituvchi va guruhlar,
  // ustiga esa Mongo YETIM qoldirgan qatorlar (endi ular ham ketishi SHART).
  //
  // TARTIB `information_schema` dagi haqiqiy FK grafidan topologik
  // hisoblangan (bola → ota).
  // ═══════════════════════════════════════════════════════════════════════
  const doomedUsers = await prisma.user.findMany({
    where: { role: { in: [ROLES.STUDENT, ROLES.TEACHER] } },
    select: { id: true },
  });
  const uid = doomedUsers.map((u) => u.id);
  const gid = (await prisma.group.findMany({ select: { id: true } })).map((g) => g.id);

  // ─────────────────────────────────────────────────────────────────────
  // OLDINDAN TEKSHIRUV: moliyaviy jurnal tozalashni to'sadimi?
  //
  // `20260820120000_restrict_journal_and_salary_ownership_fks` dan keyin
  // `journal_entries` ning egalik ustunlari `RESTRICT`. Ya'ni jurnalda
  // izi qolgan o'quvchi/o'qituvchi/guruhni o'chirib BO'LMAYDI — va bu
  // TO'G'RI: moliyaviy tarixni jimgina yo'q qilgandan ko'ra seed
  // to'xtagani yaxshi.
  //
  // Lekin xom FK xatosi tushunarsiz ("Foreign key constraint violated ...
  // journal_entries_studentId_fkey" — `group.deleteMany()` paytida).
  // Shuning uchun sabab OLDINDAN, o'qiladigan tilda aytiladi.
  //
  // Bunga tushib qolish yo'li: `seed:finance-demo` yoki haqiqiy to'lov
  // oqimi demo odam/guruhga jurnal yozuvi yozgan bo'lsa.
  // ─────────────────────────────────────────────────────────────────────
  const blockingEntries = await prisma.journalEntry.count({
    where: {
      OR: [
        { studentId: { in: uid } },
        { teacherId: { in: uid } },
        { staffId: { in: uid } },
        { groupId: { in: gid } },
      ],
    },
  });
  if (blockingEntries > 0) {
    throw new Error(
      `Tozalash to'xtatildi: ${blockingEntries} ta moliyaviy jurnal yozuvi ` +
        `o'chirilishi kerak bo'lgan demo o'quvchi/o'qituvchi/guruhga bog'langan. ` +
        `Jurnal O'ZGARMAS — u o'chirilmaydi va tahrirlanmaydi. ` +
        `Toza demo ma'lumot kerak bo'lsa: npm run db:reset`,
    );
  }

  if (uid.length || gid.length) {
    const byUser = (col) => ({ [col]: { in: uid } });
    const byGroup = (col) => ({ [col]: { in: gid } });
    // [model, where] — ketma-ket bajariladi, tartib O'ZGARTIRILMASIN.
    const CLEANUP = [
      ["groupMembership",        { OR: [byGroup("groupId"), byUser("studentId")] }],
      ["attendance",             { OR: [byGroup("groupId"), byUser("studentId")] }],
      // `grades.recordedById` ham RESTRICT - o'qituvchi qo'ygan baho uni bloklaydi.
      ["grade",                  { OR: [byGroup("groupId"), byUser("studentId"), byUser("recordedById")] }],
      ["lessonCancellation",     byGroup("groupId")],
      // `teacher_absences.recordedById` RESTRICT (teacherId esa SET NULL).
      ["teacherAbsence",         { OR: [byGroup("groupId"), byUser("recordedById")] }],
      ["paymentTransaction",     { OR: [byGroup("groupId"), byUser("studentId")] }],
      ["debtWriteOff",           { OR: [byGroup("groupId"), byUser("studentId")] }],
      ["studentPayment",         { OR: [byGroup("groupId"), byUser("studentId")] }],
      ["discount",               { OR: [byGroup("groupId"), byUser("studentId")] }],
      ["groupFee",               byGroup("groupId")],
      ["teacherGroupPeriod",     { OR: [byGroup("groupId"), byUser("teacherId")] }],
      // Maosh zanjiri: tranzaksiya → maosh. `teacher_salaries.groupId` SET NULL
      // + CHECK bo'lgani uchun GURUH bo'yicha ham o'chiriladi (yuqoridagi 2-holat).
      ["salaryTransaction",      { OR: [byUser("teacherId"), byGroup("groupId")] }],
      ["teacherSalary",          { OR: [byUser("teacherId"), byGroup("groupId")] }],
      ["attendanceExemption",    byUser("studentId")],
      ["teacherAttendance",      byUser("teacherId")],
      ["depositTransaction",     byUser("studentId")],
      ["studentDeposit",         byUser("studentId")],
      ["studentFreeze",          byUser("studentId")],
      ["teacherCompensation",    byUser("teacherId")],
      ["staffKpiAssignment",     byUser("employeeId")],
      ["staffPayrollItem",       byUser("employeeId")],
      ["staffSalaryTransaction", byUser("employeeId")],
      ["staffPayrollAdjustment", byUser("employeeId")],
      ["staffPayroll",           byUser("employeeId")],
      ["staffCompensation",      byUser("employeeId")],
      ["payrollAuditLog",        byUser("employeeId")],
      ["shift",                  byUser("cashierId")],
      ["openingBalance",         { OR: [byUser("userId"), byGroup("groupId")] }],
      ["notificationRecipient",  byUser("userId")],
      ["assignmentRecipient",    { OR: [byUser("studentId"), byGroup("groupId")] }],
      ["assignment",             byUser("senderId")],
      ["archiveLog",             { OR: [byUser("userId"), byUser("performedById")] }],
      ["refund",                 { OR: [byUser("studentId"), byUser("requestedById")] }],
      // Prisma modeli `Approval` (jadval: `expense_approvals`).
      ["approval",               byUser("requestedById")],
      // Fikr-mulohaza: FK to'smaydi (authorId SET NULL), lekin demo
      // ma'lumoti sifatida Mongo davrida ham to'liq tozalanardi.
      ["feedback",               {}],
      ["group",                  {}],
    ];
    for (const [model, where] of CLEANUP) {
      await prisma[model].deleteMany({ where });
    }
  }

  // Foydalanuvchi ENG OXIRIDA: yuqoridagilarning hammasi unga ishora qiladi.
  const removedUsers = await prisma.user.deleteMany({
    where: { role: { in: [ROLES.STUDENT, ROLES.TEACHER] } },
  });
  if (removedUsers.count) {
    logger.info(`Eski demo ma'lumot tozalandi: ${removedUsers.count} foydalanuvchi`);
  }

  const passwordHash = await hashPassword(COMMON_PASSWORD);
  // NEGA QOTIRILGAN SANA EMAS: ilgari bu yerda `new Date(2026, 4, 26)`
  // turardi. Seed shu sanagacha davomat yozardi va real vaqt undan
  // o'tib ketgach AI ning 28 kunlik oynasi (davomat, baho trendi)
  // BO'SH qolardi - butun analitika nol ko'rsatardi va sabab
  // ko'rinmasdi. Seed doim "bugungacha" ma'lumot berishi kerak.
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const teacherDocs = [];
  for (let i = 1; i <= TEACHER_COUNT; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const first = pick(gender === "male" ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(LAST_NAMES);
    teacherDocs.push({
      firstName: first,
      lastName: last,
      username: genUsername("teacher", i),
      phone: genPhone(i),
      passwordHash,
      role: ROLES.TEACHER,
      gender,
      birthDate: randDate(new Date(1975, 0, 1), new Date(1995, 11, 31)),
      hiredAt: randDate(new Date(2022, 0, 1), new Date(2024, 11, 31)),
      homeBranchId: branch.id,
      isActive: true,
    });
  }
  await bulkCreate("user", teacherDocs);
  const teachers = await attachIds(teacherDocs);
  logger.info(`${teachers.length} ta o'qituvchi yaratildi`);

  const studentDocs = [];
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const first = pick(gender === "male" ? MALE_FIRST : FEMALE_FIRST);
    const last = pick(LAST_NAMES);
    const enrolledAt =
      Math.random() < 0.7
        ? randDate(yearAgo, new Date(2025, 7, 31))
        : randDate(new Date(2025, 8, 1), now);
    studentDocs.push({
      firstName: first,
      lastName: last,
      username: genUsername("student", i),
      phone: genPhone(i + 1000),
      passwordHash,
      role: ROLES.STUDENT,
      gender,
      birthDate: randDate(new Date(2005, 0, 1), new Date(2015, 11, 31)),
      // `address` / `parentName` / `parentPhone` ATAYLAB YO'Q.
      //
      // Ular `User` da HECH QACHON bo'lmagan - eski Mongoose modelida ham
      // yo'q edi (ular `Lead` maydonlari). Mongoose sxemada e'lon
      // qilinmagan maydonni JIMGINA tashlab yuborardi, shuning uchun bu
      // qatorlar bazaga hech narsa yozmasdi va buni hech kim sezmasdi.
      // Postgres esa noma'lum ustunni rad etadi va xatoni ochib berdi.
      // Xulq-atvor O'ZGARMADI - ular ilgari ham saqlanmagan.
      enrolledAt,
      homeBranchId: branch.id,
      isActive: true,
    });
  }
  await bulkCreate("user", studentDocs);
  const students = await attachIds(studentDocs);
  logger.info(`${students.length} ta o'quvchi yaratildi`);

  const groupDocs = [];
  for (let i = 0; i < GROUP_COUNT; i++) {
    const dirName = DIRECTIONS[i % DIRECTIONS.length];
    const teacher = teachers[i];
    const letter = String.fromCharCode(65 + Math.floor(i / 6));
    const num = (i % 6) + 1;
    groupDocs.push({
      name: `${dirName} ${letter}-${num}`,
      schedule: genSchedule(),
      teacherId: teacher.id,
      branchId: branch.id,
      isActive: true,
    });
  }
  // GURUH `createMany` BILAN YOZILMAYDI.
  //
  // Ikki sabab: `schedule` endi ALOHIDA jadval (`group_schedule_items`) va
  // `teachers` ko'p-ko'pga bog'lanish. `createMany` ichma-ich yozishni
  // (nested write) qo'llab-quvvatlamaydi, shuning uchun har bir guruh
  // alohida yoziladi - guruhlar soni o'nlab, ya'ni bu sezilarli emas.
  const groups = [];
  for (const doc of groupDocs) {
    const { schedule, teacherId, ...rest } = doc;
    const row = await prisma.group.create({
      data: {
        ...rest,
        schedule: { create: schedule },
        teachers: { connect: [{ id: teacherId }] },
      },
      select: { id: true, name: true },
    });
    // Keyingi bosqichlar `group.schedule` va `group.teachers[0]` ni
    // o'qiydi - ularni bazadan qayta so'ramasdan lokal saqlaymiz.
    groups.push({ ...row, schedule, teacherId });
  }
  logger.info(`${groups.length} ta guruh yaratildi`);

  // O'QITUVCHI–GURUH DAVRLARI.
  //
  // Group.teachers[] YETARLI EMAS: AI (teacher.signal.js → loadTeachers)
  // ataylab TeacherGroupPeriod dan o'qiydi, chunki massiv tarixsiz -
  // o'tgan oy ketgan o'qituvchini ham "hozir ishlayapti" deb ko'rsatardi.
  // Seed bu yozuvlarni yaratmasa, AI filialda BITTA ham o'qituvchi
  // ko'rmaydi va o'qituvchi analitikasi butunlay bo'sh qoladi.
  const periodDocs = groups.map((g, i) => ({
    teacherId: g.teacherId,
    groupId: g.id,
    startDate: randDate(yearAgo, new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)),
    endDate: null, // hozir dars beradi
    salaryType: "percent",
    percentRate: 40 + (i % 3) * 5,
    createdById: owner.id,
  }));
  await bulkCreate("teacherGroupPeriod", periodDocs);
  logger.info(`${periodDocs.length} ta o'qituvchi-guruh davri yaratildi`);

  const membershipDocs = [];
  for (const student of students) {
    const numGroups = weighted([
      { value: 1, weight: 50 },
      { value: 2, weight: 35 },
      { value: 3, weight: 15 },
    ]);
    const picked = [...groups].sort(() => Math.random() - 0.5).slice(0, numGroups);
    for (const group of picked) {
      const minJoin =
        student.enrolledAt > yearAgo ? student.enrolledAt : yearAgo;
      const joinedAt = randDate(minJoin, now);
      const hasLeft = Math.random() < 0.1;
      const leftAt = hasLeft ? randDate(joinedAt, now) : null;
      const leftReason = hasLeft
        ? pick(["graduated", "removed", "transferred"])
        : null;
      membershipDocs.push({
        groupId: group.id,
        studentId: student.id,
        joinedAt,
        leftAt,
        leftReason,
      });
    }
  }
  await bulkCreate("groupMembership", membershipDocs);
  // Keyingi bosqich faqat (groupId, studentId, joinedAt, leftAt) ni o'qiydi -
  // `id` kerak emas, shuning uchun qayta o'qish ham shart emas.
  const memberships = membershipDocs;
  logger.info(`${memberships.length} ta group membership yaratildi`);


  // --- Reference data for ancillary collections ---
  const feedbackTypes = await prisma.feedbackType.findMany({ where: { isActive: true } });
  if (feedbackTypes.length === 0) {
    throw new Error(
      "Reference data yo'q. Avval `npm run seed:communication` ishga tushiring.",
    );
  }

  // AttendanceSettings (singleton)
  // Singleton: `AttendanceSettings.id` sxemada `@default("default")`.
  // `update: {}` - mavjud sozlama TEGILMAYDI (eski `$setOnInsert` kabi).
  await prisma.attendanceSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  logger.info("AttendanceSettings tayyor");

  // AttendanceExemption: 5% studentlarda
  const exemptionDocs = [];
  for (const student of students) {
    if (Math.random() < 0.05) {
      exemptionDocs.push({
        studentId: student.id,
        startDate: randDate(yearAgo, now),
        endDate: null,
        daysOfWeek: pick([[], ["fri"], ["sat"], ["fri", "sat"]]),
        reason: pick([
          "Tibbiy sabab",
          "Sport mashg'uloti",
          "Boshqa kurs",
          "Oilaviy sharoit",
        ]),
        isActive: true,
        createdById: owner.id,
      });
    }
  }
  if (exemptionDocs.length > 0) await bulkCreate("attendanceExemption", exemptionDocs);
  logger.info(`${exemptionDocs.length} ta attendance exemption yaratildi`);

  // Attendance: har bir guruh uchun jadval kunlarida
  const DAY_NUM_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const teacherByGroup = new Map();
  for (const g of groups) teacherByGroup.set(String(g.id), g.teacherId);
  const membershipsByGroupId = new Map();
  for (const m of memberships) {
    const k = String(m.groupId);
    if (!membershipsByGroupId.has(k)) membershipsByGroupId.set(k, []);
    membershipsByGroupId.get(k).push(m);
  }

  let totalAttendance = 0;
  for (const group of groups) {
    const scheduleDays = new Set(group.schedule.map((s) => s.day));
    const groupMembers = membershipsByGroupId.get(String(group.id)) || [];
    if (groupMembers.length === 0) continue;
    const teacherId = teacherByGroup.get(String(group.id));

    const docs = [];
    const cursor = new Date(yearAgo);
    while (cursor <= now) {
      const dayKey = DAY_NUM_TO_KEY[cursor.getDay()];
      if (scheduleDays.has(dayKey)) {
        const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        for (const m of groupMembers) {
          if (m.joinedAt > cursor) continue;
          if (m.leftAt && m.leftAt < cursor) continue;
          const status = weighted([
            { value: "present", weight: 87 },
            { value: "absent", weight: 8 },
            { value: "excused", weight: 4 },
            { value: "exempt", weight: 1 },
          ]);
          const doc = {
            groupId: group.id,
            studentId: m.studentId,
            date: new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate(),
              17,
            ),
            dateKey,
            status,
            recordedById: teacherId,
            source: "teacher",
            recordedAt: new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate(),
              20,
            ),
          };
          if (status === "excused")
            doc.reason = pick([
              "Kasallik",
              "Oilaviy sabab",
              "Tibbiy ko'rik",
              "Boshqa kurs",
            ]);
          docs.push(doc);
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (docs.length > 0) {
      await bulkCreate("attendance", docs, 5000);
      totalAttendance += docs.length;
    }
  }
  logger.info(`${totalAttendance} ta davomat yozuvi yaratildi`);


  // Feedback: 80 ta
  const feedbackDocs = [];
  const FB_MESSAGES = [
    "O'qituvchi juda yaxshi tushuntiradi, rahmat!",
    "Dars vaqtini biroz ertaroq qilsangiz yaxshi bo'lardi.",
    "Guruhda o'quvchilar soni biroz ko'p, e'tibor kam.",
    "Yangi mavzular qiziqarli, lekin uy vazifalari ko'p.",
    "Markazning sharoiti yoqdi, ammo internet sekin.",
    "To'lov muddatini uzaytira olasizmi? Sharoit yo'q.",
    "Sinov darsi yaxshi o'tdi, hammasi mukammal.",
    "Boshqa guruhga o'tkazsangiz iltimos, vaqt to'g'ri kelmayapti.",
  ];
  for (let i = 0; i < 80; i++) {
    const author = pick(students);
    const isAnon = Math.random() < 0.2;
    const status = weighted([
      { value: "new", weight: 30 },
      { value: "in_review", weight: 20 },
      { value: "resolved", weight: 40 },
      { value: "rejected", weight: 10 },
    ]);
    const fb = {
      authorId: isAnon ? null : author.id,
      authorRoleSnapshot: isAnon ? "" : "student",
      isAnonymous: isAnon,
      typeId: pick(feedbackTypes).id,
      groupId: Math.random() < 0.5 ? pick(groups).id : null,
      message: pick(FB_MESSAGES),
      status,
    };
    if (status === "in_review" || status === "resolved" || status === "rejected") {
      fb.reviewedById = owner.id;
      fb.reviewedAt = randDate(yearAgo, now);
    }
    if (status === "resolved") {
      fb.resolvedById = owner.id;
      fb.resolvedAt = randDate(yearAgo, now);
      fb.adminReply = "Murojaatingiz uchun rahmat, ko'rib chiqildi.";
      fb.repliedById = owner.id;
      fb.repliedAt = fb.resolvedAt;
    }
    if (status === "rejected") {
      fb.rejectionReason = "Murojaat asossiz";
    }
    feedbackDocs.push(fb);
  }
  await bulkCreate("feedback", feedbackDocs);
  logger.info(`${feedbackDocs.length} ta fikr-mulohaza yaratildi`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  logger.info(
    `Fake data tayyor (${elapsed}s): ${teachers.length} teacher, ${students.length} student, ${groups.length} group, ${memberships.length} membership, ${totalAttendance} attendance, ${feedbackDocs.length} feedback`,
  );
  logger.info(`Login parol (barcha fake userlar): ${COMMON_PASSWORD}`);
  logger.info(`Username prefiks: student_<i>_${RUN_TAG} | teacher_<i>_${RUN_TAG}`);

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Fake data seed xato");
  process.exit(1);
});
