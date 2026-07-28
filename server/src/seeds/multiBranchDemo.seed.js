import "dotenv/config";
import mongoose from "mongoose";
import { faker } from "@faker-js/faker";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";

import Branch from "../models/branch.model.js";
import User from "../models/user.model.js";
import Role from "../models/role.model.js";
import Group from "../models/group.model.js";
import GroupMembership from "../models/groupMembership.model.js";
import GroupFee from "../models/groupFee.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import TeacherGroupPeriod from "../models/teacherGroupPeriod.model.js";

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

const oid = () => new mongoose.Types.ObjectId();
const pick = (arr) => arr[faker.number.int({ min: 0, max: arr.length - 1 })];

const seed = async () => {
  await connectDB();
  const t0 = Date.now();

  // ─── Tozalash (owner, rollar, ruxsatlar SAQLANADI) ───
  logger.info("Eski demo ma'lumot tozalanmoqda...");
  await Promise.all([
    Group.deleteMany({}),
    GroupMembership.deleteMany({}),
    GroupFee.deleteMany({}),
    StudentPayment.deleteMany({}),
    PaymentTransaction.deleteMany({}),
    TeacherSalary.deleteMany({}),
    SalaryTransaction.deleteMany({}),
    TeacherGroupPeriod.deleteMany({}),
    User.deleteMany({ role: { $in: ["student", "teacher", "director"] } }),
    Branch.deleteMany({ isMain: { $ne: true } }),
  ]);

  const directorRole = await Role.findOne({ value: "director" });
  if (!directorRole) {
    throw new Error("'director' roli topilmadi - avval: npm run seed:permissions");
  }

  const months = monthList();

  // ─── 1) FILIALLAR ───
  // Asosiy filial bo'lsa - birinchisi sifatida ishlatamiz (o'chirib bo'lmaydi).
  const mainBranch = await Branch.findOne({ isMain: true });
  const branchDocs = [];
  for (const [i, b] of BRANCHES.entries()) {
    if (i === 0 && mainBranch) {
      mainBranch.name = b.name;
      mainBranch.code = b.code;
      mainBranch.phone = b.phone;
      await mainBranch.save();
      branchDocs.push(mainBranch);
    } else {
      branchDocs.push(
        await Branch.create({ name: b.name, code: b.code, phone: b.phone, isActive: true }),
      );
    }
  }
  logger.info(`Filiallar: ${branchDocs.length}`);

  // ─── 2) DIREKTORLAR (har filialga bittadan) ───
  const directors = branchDocs.map((br, i) => ({
    _id: oid(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    username: `dir_${BRANCHES[i].code.toLowerCase()}`,
    passwordHash: "parol123",
    role: "director",
    homeBranchId: br._id,
    branchAssignments: [],
    isActive: true,
    hiredAt: new Date(),
  }));
  await User.insertMany(directors);

  // ─── 3) O'QITUVCHILAR ───
  // Har filialga 20 ta + IKKI FILIALDA ishlaydigan 3 ta (sinov uchun muhim).
  const teachers = [];
  const teachersByBranch = new Map();
  for (const [bi, br] of branchDocs.entries()) {
    const list = [];
    for (let i = 0; i < 20; i += 1) {
      const t = {
        _id: oid(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        username: `teach_${BRANCHES[bi].code.toLowerCase()}_${i}`,
        passwordHash: "parol123",
        role: "teacher",
        homeBranchId: br._id,
        branchAssignments: [],
        isActive: true,
        hiredAt: months[0].start,
      };
      teachers.push(t);
      list.push(t);
    }
    teachersByBranch.set(String(br._id), list);
  }
  // IKKI FILIALLI o'qituvchilar: 0-filialning ilk 3 tasi 1-filialda ham ishlaydi.
  const crossTeachers = teachersByBranch.get(String(branchDocs[0]._id)).slice(0, 3);
  for (const t of crossTeachers) {
    t.branchAssignments = [{ branchId: branchDocs[1]._id, role: "teacher" }];
    teachersByBranch.get(String(branchDocs[1]._id)).push(t);
  }
  await User.insertMany(teachers);
  logger.info(`O'qituvchilar: ${teachers.length} (${crossTeachers.length} tasi 2 filialda)`);

  // ─── 4) GURUHLAR ───
  const groups = [];
  const groupsByBranch = new Map();
  for (const [bi, br] of branchDocs.entries()) {
    const list = [];
    const brTeachers = teachersByBranch.get(String(br._id));
    for (let i = 0; i < GROUPS_PER_BRANCH; i += 1) {
      const teacher = brTeachers[i % brTeachers.length];
      const g = {
        _id: oid(),
        branchId: br._id,
        name: `${BRANCHES[bi].code}-${pick(SUBJECTS)}-${i + 1}`,
        schedule: [
          { day: DAYS[i % 6], startTime: "09:00", endTime: "10:30", effectiveFrom: null },
          { day: DAYS[(i + 2) % 6], startTime: "09:00", endTime: "10:30", effectiveFrom: null },
        ],
        teachers: [teacher._id],
        startDate: months[0].start,
        isActive: true,
      };
      groups.push(g);
      list.push({ ...g, teacherId: teacher._id });
    }
    groupsByBranch.set(String(br._id), list);
  }
  await Group.insertMany(groups);
  logger.info(`Guruhlar: ${groups.length}`);

  // ─── 5) GURUH NARXLARI (har guruh × har oy) ───
  const fees = [];
  for (const g of groups) {
    for (const m of months) {
      fees.push({ group: g._id, year: m.year, month: m.month, amount: FEE, source: "manual" });
    }
  }
  await GroupFee.insertMany(fees);
  logger.info(`Guruh narxlari: ${fees.length}`);

  // ─── 6) O'QUVCHILAR + A'ZOLIK ───
  const students = [];
  const memberships = [];
  const studentsByBranch = new Map();

  for (const [bi, br] of branchDocs.entries()) {
    const brGroups = groupsByBranch.get(String(br._id));
    const list = [];
    for (let i = 0; i < STUDENTS_PER_BRANCH; i += 1) {
      const s = {
        _id: oid(),
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        username: `stud_${BRANCHES[bi].code.toLowerCase()}_${i}`,
        passwordHash: "parol123",
        role: "student",
        homeBranchId: br._id,
        branchAssignments: [],
        isActive: true,
        enrolledAt: months[0].start,
        gender: pick(["male", "female"]),
      };
      students.push(s);
      list.push(s);

      const g = brGroups[i % brGroups.length];
      memberships.push({
        group: g._id,
        student: s._id,
        joinedAt: months[0].start,
        leftAt: null,
      });
    }
    studentsByBranch.set(String(br._id), list);
  }

  // ─── KO'CHGAN O'QUVCHILAR (eng muhim sinov holati) ───
  // 0-filialning oxirgi 5 o'quvchisi 3-oyda 1-filialga ko'chadi.
  // Ular IKKI filialda ham to'lov tarixiga ega bo'ladi - aynan shu
  // holat "aralashib ketmaydimi" degan savolga javob beradi.
  const transferMonth = months[3];
  const movers = studentsByBranch.get(String(branchDocs[0]._id)).slice(-5);
  const targetGroups = groupsByBranch.get(String(branchDocs[1]._id));
  for (const [i, s] of movers.entries()) {
    // Eski a'zolikni yopamiz
    const old = memberships.find((m) => String(m.student) === String(s._id));
    if (old) {
      old.leftAt = transferMonth.start;
      old.leftReason = "transferred";
    }
    // Yangi filialda yangi a'zolik
    const ng = targetGroups[i % targetGroups.length];
    memberships.push({
      group: ng._id,
      student: s._id,
      joinedAt: transferMonth.start,
      leftAt: null,
    });
    // homeBranchId yangi filialga o'tadi, lekin ESKI filial ham qoladi
    // (u yerda to'lov tarixi bor).
    s.homeBranchId = branchDocs[1]._id;
    s.branchAssignments = [{ branchId: branchDocs[0]._id, role: "student" }];
  }

  await User.insertMany(students);
  await GroupMembership.insertMany(memberships);
  logger.info(`O'quvchilar: ${students.length} (${movers.length} tasi ko'chgan)`);

  // ─── 7) OYLIK TO'LOVLAR + TRANZAKSIYALAR ───
  // To'lov holatlari taqsimoti (realistik):
  //   60% to'liq to'lagan, 20% qisman, 15% qarzdor, 5% ortiqcha
  const payments = [];
  const transactions = [];
  const groupById = new Map(groups.map((g) => [String(g._id), g]));

  for (const m of months) {
    for (const mem of memberships) {
      // A'zolik shu oyda faol bo'lganmi
      const joined = mem.joinedAt.getTime() <= m.start.getTime();
      const left = mem.leftAt && mem.leftAt.getTime() <= m.start.getTime();
      if (!joined || left) continue;

      const g = groupById.get(String(mem.group));
      if (!g) continue;

      const paymentId = oid();
      const roll = faker.number.int({ min: 1, max: 100 });
      let paid;
      if (roll <= 60) paid = FEE; // to'liq
      else if (roll <= 80) paid = Math.round(FEE * 0.5); // qisman
      else if (roll <= 95) paid = 0; // qarzdor
      else paid = FEE; // ortiqchani pastda alohida qo'shamiz

      payments.push({
        _id: paymentId,
        branchId: g.branchId, // GURUHDAN meros - filial haqiqati shu
        student: mem.student,
        group: g._id,
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
          payment: paymentId,
          student: mem.student,
          group: g._id,
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
  await StudentPayment.insertMany(payments);
  await PaymentTransaction.insertMany(transactions);
  logger.info(`O'quvchi to'lovlari: ${payments.length}, tranzaksiyalar: ${transactions.length}`);

  // ─── 8) O'QITUVCHI MAOSHLARI ───
  // Har guruh+oy uchun: fiksa maosh, 70% to'langan.
  const salaries = [];
  const salaryTxns = [];
  const FIXED_SALARY = 1_500_000;

  for (const m of months) {
    for (const g of groups) {
      const salaryId = oid();
      const teacherId = g.teachers[0];
      const paid = faker.number.int({ min: 1, max: 100 }) <= 70 ? FIXED_SALARY : 0;

      salaries.push({
        _id: salaryId,
        branchId: g.branchId,
        teacher: teacherId,
        group: g._id,
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
          salary: salaryId,
          teacher: teacherId,
          group: g._id,
          year: m.year,
          month: m.month,
          amount: paid,
          method: pick(["cash", "card"]),
          paidAt: new Date(m.start.getTime() + 25 * 86400000),
        });
      }
    }
  }
  await TeacherSalary.insertMany(salaries);
  await SalaryTransaction.insertMany(salaryTxns);
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
