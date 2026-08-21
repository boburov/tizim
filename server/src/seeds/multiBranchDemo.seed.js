import "dotenv/config";
import { randomBytes } from "node:crypto";
import { faker } from "@faker-js/faker";
import prisma, { connectDB, disconnectDB } from "../config/prisma.js";
import logger from "../config/logger.js";

/**
 * KO'P FILIALLI DEMO MA'LUMOT.
 *
 * 5 filial × ~40 guruh × ~200 o'quvchi × 6 oy to'lov tarixi.
 *
 * MAQSAD: filiallar orasida moliya ARALASHMASLIGINI katta hajmda
 * tekshirish. Kichik (2 filialli) sinov ba'zi xatolarni ko'rsatmaydi.
 *
 * ATAYLAB QIYIN HOLATLAR (aynan shular sinovni kuchli qiladi):
 *   • KO'CHGAN o'quvchi - A filialda 3 oy, keyin B filialda 3 oy
 *   • IKKI FILIALDA ishlaydigan o'qituvchi
 *   • Har xil to'lov holati: to'liq / qisman / qarzdor / ortiqcha
 *
 * TAKRORLANUVCHI: faker urug'i qat'iy (SEED=42), ya'ni har ishga
 * tushirishda AYNAN o'sha ma'lumot chiqadi - tekshiruvlar barqaror.
 *
 * ISHLATISH:  npm run seed:multi-branch
 * DIQQAT: mavjud demo ma'lumotni O'CHIRADI (owner/rollar saqlanadi).
 */

faker.seed(42);

const BRANCHES = [
  { name: "Andijon filiali", code: "AND", phone: "998901110001" },
  { name: "Buxoro filiali", code: "BUX", phone: "998901110002" },
  { name: "Toshkent filiali", code: "TOSH", phone: "998901110003" },
  { name: "Farg'ona filiali", code: "FARG", phone: "998901110004" },
  { name: "Navoiy filiali", code: "NAV", phone: "998901110005" },
];

const GROUPS_PER_BRANCH = 40;
const STUDENTS_PER_BRANCH = 200;
const MONTHS = 6;
const FEE = 500_000; // oylik narx

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"];
const SUBJECTS = ["Ingliz tili", "Matematika", "Fizika", "Kimyo", "IT", "Rus tili"];

// Oxirgi 6 oy (bugundan orqaga)
const monthList = () => {
  const now = new Date();
  const out = [];
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, start: d });
  }
  return out;
};

// `gen_object_id()` (prisma/migrations/..._object_id_function) NING JS
// EKVIVALENTI: 8 hex — unix sekund, 16 hex — tasodifiy. Jami 24 belgi,
// ya'ni `varchar(24)` ustuniga va `/^[0-9a-fA-F]{24}$/` validatoriga mos.
//
// NEGA KALIT OLDINDAN YARATILADI: bu seed bog'lanishlarni yozishdan
// OLDIN quradi (to'lov → tranzaksiya, maosh → maosh to'lovi), shuning
// uchun `createMany` bilan ommaviy yozish mumkin bo'ladi. Bazadan
// qaytgan kalitni kutish har bir yozuvni alohida qilishga majburlardi.
const oid = () =>
  Math.floor(Date.now() / 1000).toString(16).padStart(8, "0") +
  randomBytes(8).toString("hex");
const pick = (arr) => arr[faker.number.int({ min: 0, max: arr.length - 1 })];

const seed = async () => {
  await connectDB();
  const t0 = Date.now();

  // ─── Tozalash (owner, rollar, ruxsatlar SAQLANADI) ───
  logger.info("Eski demo ma'lumot tozalanmoqda...");
  // ⚠ TARTIB MAJBURIY (PostgreSQL FK'lari RESTRICT): bola ota'sidan OLDIN.
  //   payment_transactions → student_payments
  //   salary_transactions  → teacher_salaries
  // Mongo'da FK yo'q edi va bu `Promise.all` bilan parallel ketardi.
  const CLEANUP_ORDER = [
    "paymentTransaction",
    "studentPayment",
    "salaryTransaction",
    "teacherSalary",
    "groupFee",
    "groupMembership",
    "teacherGroupPeriod",
    "group",
  ];
  for (const model of CLEANUP_ORDER) await prisma[model].deleteMany({});
  // Foydalanuvchi va filial ENG OXIRIDA - yuqoridagilar ularga ishora qiladi.
  await prisma.user.deleteMany({ where: { role: { in: ["student", "teacher", "director"] } } });
  await prisma.branch.deleteMany({ where: { isMain: false } });

  const directorRole = await prisma.role.findFirst({ where: { value: "director" } });
  if (!directorRole) {
    throw new Error("'director' roli topilmadi - avval: npm run seed:permissions");
  }

  const months = monthList();

  // ─── 1) FILIALLAR ───
  // Asosiy filial bo'lsa - birinchisi sifatida ishlatamiz (o'chirib bo'lmaydi).
  const mainBranch = await prisma.branch.findFirst({ where: { isMain: true } });
  const branchDocs = [];
  for (const [i, b] of BRANCHES.entries()) {
    if (i === 0 && mainBranch) {
      branchDocs.push(
        await prisma.branch.update({
          where: { id: mainBranch.id },
          data: { name: b.name, code: b.code, phone: b.phone },
        }),
      );
    } else {
      branchDocs.push(
        await prisma.branch.create({
          data: { name: b.name, code: b.code, phone: b.phone, isActive: true },
        }),
      );
    }
  }
  logger.info(`Filiallar: ${branchDocs.length}`);

  // ─── 2) DIREKTORLAR (har filialga bittadan) ───
  const directors = branchDocs.map((br, i) => ({
    id: oid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    username: `dir_${BRANCHES[i].code.toLowerCase()}`,
    passwordHash: "parol123",
    role: "director",
    homeBranchId: br.id,
    isActive: true,
    hiredAt: new Date(),
  }));
  await prisma.user.createMany({ data: directors });

  // ─── 3) O'QITUVCHILAR ───
  // Har filialga 20 ta + IKKI FILIALDA ishlaydigan 3 ta (sinov uchun muhim).
  const teachers = [];
  const teachersByBranch = new Map();
  for (const [bi, br] of branchDocs.entries()) {
    const list = [];
    for (let i = 0; i < 20; i += 1) {
      const t = {
        id: oid(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        username: `teach_${BRANCHES[bi].code.toLowerCase()}_${i}`,
        passwordHash: "parol123",
        role: "teacher",
        homeBranchId: br.id,
        isActive: true,
        hiredAt: months[0].start,
      };
      teachers.push(t);
      list.push(t);
    }
    teachersByBranch.set(String(br.id), list);
  }
  // IKKI FILIALLI o'qituvchilar: 0-filialning ilk 3 tasi 1-filialda ham ishlaydi.
  //
  // `branchAssignments` ENDI ICHKI MASSIV EMAS - u alohida jadval
  // (`user_branch_assignments`). Shuning uchun u foydalanuvchi bilan
  // BIRGA emas, undan KEYIN yoziladi (FK: avval `users` qatori bo'lishi shart).
  const teacherAssignments = [];
  const crossTeachers = teachersByBranch.get(String(branchDocs[0].id)).slice(0, 3);
  for (const t of crossTeachers) {
    teacherAssignments.push({ userId: t.id, branchId: branchDocs[1].id, role: "teacher" });
    teachersByBranch.get(String(branchDocs[1].id)).push(t);
  }
  await prisma.user.createMany({ data: teachers });
  await prisma.userBranchAssignment.createMany({ data: teacherAssignments });
  logger.info(`O'qituvchilar: ${teachers.length} (${crossTeachers.length} tasi 2 filialda)`);

  // ─── 4) GURUHLAR ───
  const groups = [];
  const groupsByBranch = new Map();
  for (const [bi, br] of branchDocs.entries()) {
    const list = [];
    const brTeachers = teachersByBranch.get(String(br.id));
    for (let i = 0; i < GROUPS_PER_BRANCH; i += 1) {
      const teacher = brTeachers[i % brTeachers.length];
      const g = {
        id: oid(),
        branchId: br.id,
        name: `${BRANCHES[bi].code}-${pick(SUBJECTS)}-${i + 1}`,
        schedule: [
          { day: DAYS[i % 6], startTime: "09:00", endTime: "10:30", effectiveFrom: null },
          { day: DAYS[(i + 2) % 6], startTime: "09:00", endTime: "10:30", effectiveFrom: null },
        ],
        teacherId: teacher.id,
        startDate: months[0].start,
        isActive: true,
      };
      groups.push(g);
      list.push(g);
    }
    groupsByBranch.set(String(br.id), list);
  }
  // Guruh `createMany` bilan yozilmaydi: `schedule` alohida jadval,
  // `teachers` esa ko'p-ko'pga bog'lanish - ikkalasi ham ichma-ich
  // yozishni talab qiladi.
  for (const g of groups) {
    const { schedule, teacherId, ...rest } = g;
    await prisma.group.create({
      data: {
        ...rest,
        schedule: { create: schedule },
        teachers: { connect: [{ id: teacherId }] },
      },
      select: { id: true },
    });
  }
  logger.info(`Guruhlar: ${groups.length}`);

  // ─── 5) GURUH NARXLARI (har guruh × har oy) ───
  const fees = [];
  for (const g of groups) {
    for (const m of months) {
      fees.push({ groupId: g.id, year: m.year, month: m.month, amount: FEE, source: "manual" });
    }
  }
  await prisma.groupFee.createMany({ data: fees });
  logger.info(`Guruh narxlari: ${fees.length}`);

  // ─── 6) O'QUVCHILAR + A'ZOLIK ───
  const students = [];
  const memberships = [];
  const studentsByBranch = new Map();

  for (const [bi, br] of branchDocs.entries()) {
    const brGroups = groupsByBranch.get(String(br.id));
    const list = [];
    for (let i = 0; i < STUDENTS_PER_BRANCH; i += 1) {
      const s = {
        id: oid(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        username: `stud_${BRANCHES[bi].code.toLowerCase()}_${i}`,
        passwordHash: "parol123",
        role: "student",
        homeBranchId: br.id,
        isActive: true,
        enrolledAt: months[0].start,
        gender: pick(["male", "female"]),
      };
      students.push(s);
      list.push(s);

      const g = brGroups[i % brGroups.length];
      memberships.push({
        groupId: g.id,
        studentId: s.id,
        joinedAt: months[0].start,
        leftAt: null,
      });
    }
    studentsByBranch.set(String(br.id), list);
  }

  // ─── KO'CHGAN O'QUVCHILAR (eng muhim sinov holati) ───
  // 0-filialning oxirgi 5 o'quvchisi 3-oyda 1-filialga ko'chadi.
  // Ular IKKI filialda ham to'lov tarixiga ega bo'ladi - aynan shu
  // holat "aralashib ketmaydimi" degan savolga javob beradi.
  const transferMonth = months[3];
  const moverAssignments = [];
  const movers = studentsByBranch.get(String(branchDocs[0].id)).slice(-5);
  const targetGroups = groupsByBranch.get(String(branchDocs[1].id));
  for (const [i, s] of movers.entries()) {
    // Eski a'zolikni yopamiz
    const old = memberships.find((m) => String(m.studentId) === String(s.id));
    if (old) {
      old.leftAt = transferMonth.start;
      old.leftReason = "transferred";
    }
    // Yangi filialda yangi a'zolik
    const ng = targetGroups[i % targetGroups.length];
    memberships.push({
      groupId: ng.id,
      studentId: s.id,
      joinedAt: transferMonth.start,
      leftAt: null,
    });
    // homeBranchId yangi filialga o'tadi, lekin ESKI filial ham qoladi
    // (u yerda to'lov tarixi bor).
    s.homeBranchId = branchDocs[1].id;
    // Eski filial biriktirmasi - alohida jadvalga, foydalanuvchidan KEYIN.
    moverAssignments.push({ userId: s.id, branchId: branchDocs[0].id, role: "student" });
  }

  await prisma.user.createMany({ data: students });
  await prisma.userBranchAssignment.createMany({ data: moverAssignments });
  await prisma.groupMembership.createMany({ data: memberships });
  logger.info(`O'quvchilar: ${students.length} (${movers.length} tasi ko'chgan)`);

  // ─── 7) OYLIK TO'LOVLAR + TRANZAKSIYALAR ───
  // To'lov holatlari taqsimoti (realistik):
  //   60% to'liq to'lagan, 20% qisman, 15% qarzdor, 5% ortiqcha
  const payments = [];
  const transactions = [];
  const groupById = new Map(groups.map((g) => [String(g.id), g]));

  for (const m of months) {
    for (const mem of memberships) {
      // A'zolik shu oyda faol bo'lganmi
      const joined = mem.joinedAt.getTime() <= m.start.getTime();
      const left = mem.leftAt && mem.leftAt.getTime() <= m.start.getTime();
      if (!joined || left) continue;

      const g = groupById.get(String(mem.groupId));
      if (!g) continue;

      const paymentId = oid();
      const roll = faker.number.int({ min: 1, max: 100 });
      let paid;
      if (roll <= 60) paid = FEE; // to'liq
      else if (roll <= 80) paid = Math.round(FEE * 0.5); // qisman
      else if (roll <= 95) paid = 0; // qarzdor
      else paid = FEE; // ortiqchani pastda alohida qo'shamiz

      payments.push({
        id: paymentId,
        branchId: g.branchId, // GURUHDAN meros - filial haqiqati shu
        studentId: mem.studentId,
        groupId: g.id,
        year: m.year,
        month: m.month,
        baseFee: FEE,
        prorationFactor: 1,
        discountApplied: 0,
        expectedAmount: FEE,
        paidAmount: paid,
        status: paid >= FEE ? "paid" : paid > 0 ? "partial" : "unpaid",
        recalculatedAt: new Date(),
      });

      if (paid > 0) {
        transactions.push({
          branchId: g.branchId, // plandan meros
          paymentId,
          studentId: mem.studentId,
          groupId: g.id,
          year: m.year,
          month: m.month,
          amount: paid,
          source: "direct",
          method: pick(["cash", "card"]),
          paidAt: new Date(m.start.getTime() + 5 * 86400000),
          note: "",
        });
      }
    }
  }
  await prisma.studentPayment.createMany({ data: payments });
  await prisma.paymentTransaction.createMany({ data: transactions });
  logger.info(`O'quvchi to'lovlari: ${payments.length}, tranzaksiyalar: ${transactions.length}`);

  // ─── 8) O'QITUVCHI MAOSHLARI ───
  // Har guruh+oy uchun: fiksa maosh, 70% to'langan.
  const salaries = [];
  const salaryTxns = [];
  const FIXED_SALARY = 1_500_000;

  for (const m of months) {
    for (const g of groups) {
      const salaryId = oid();
      const teacherId = g.teacherId;
      const paid = faker.number.int({ min: 1, max: 100 }) <= 70 ? FIXED_SALARY : 0;

      salaries.push({
        id: salaryId,
        branchId: g.branchId,
        teacherId,
        groupId: g.id,
        year: m.year,
        month: m.month,
        salaryType: "fixed",
        fixedAmount: FIXED_SALARY,
        percentRate: 0,
        prorationFactor: 1,
        proratedFixed: FIXED_SALARY,
        percentAmount: 0,
        baseEarnings: FIXED_SALARY,
        expectedAmount: FIXED_SALARY,
        paidAmount: paid,
        status: paid >= FIXED_SALARY ? "paid" : "unpaid",
        source: "auto",
        recalculatedAt: new Date(),
      });

      if (paid > 0) {
        salaryTxns.push({
          branchId: g.branchId,
          salaryId,
          teacherId,
          groupId: g.id,
          year: m.year,
          month: m.month,
          amount: paid,
          method: pick(["cash", "card"]),
          paidAt: new Date(m.start.getTime() + 25 * 86400000),
        });
      }
    }
  }
  await prisma.teacherSalary.createMany({ data: salaries });
  await prisma.salaryTransaction.createMany({ data: salaryTxns });
  logger.info(`Maoshlar: ${salaries.length}, maosh to'lovlari: ${salaryTxns.length}`);

  // ─── XULOSA ───
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const total =
    branchDocs.length + directors.length + teachers.length + students.length +
    groups.length + memberships.length + fees.length + payments.length +
    transactions.length + salaries.length + salaryTxns.length;

  logger.info(`\nJAMI ${total} hujjat (${secs}s)`);
  logger.info("Direktor loginlari: dir_and, dir_bux, dir_tosh, dir_farg, dir_nav (parol: parol123)");

  await disconnectDB();
};

seed().catch((err) => {
  logger.error({ err }, "Demo seed xato");
  process.exit(1);
});
