import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";

import Branch from "../models/branch.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Lead from "../models/lead.model.js";
import StudentPayment from "../models/studentPayment.model.js";
import PaymentTransaction from "../models/paymentTransaction.model.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import DepositTransaction from "../models/depositTransaction.model.js";

// FILIAL MIGRATSIYASI (bir martalik, IDEMPOTENT).
//
// Mavjud tenant bitta filialli bo'lgan - barcha ma'lumot "Asosiy filial"ga
// biriktiriladi. Shundan keyin owner yangi filial ocha oladi.
//
// XAVFSIZLIK:
//  * Idempotent: qayta ishga tushirilsa faqat branchId'siz hujjatlarni
//    to'ldiradi ({ branchId: { $exists: false } } filtri).
//  * `role` maydoni O'CHIRILMAYDI - u asosiy rol bo'lib qoladi.
//    Shu tufayli eski kodga qaytish (rollback) xavfsiz.
//  * Indekslar syncIndexes bilan yangilanadi (oxirida).
//
// ISHGA TUSHIRISH:  npm run migrate:branches

const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // --- 1) Asosiy filialni yaratish (yoki mavjudini olish) ---
  let main = await Branch.findOne({ isMain: true, isDeleted: false });
  if (!main) {
    main = await Branch.create({
      name: "Asosiy filial",
      code: "MAIN",
      isMain: true,
      isActive: true,
    });
    logger.info({ branchId: String(main._id) }, "Asosiy filial yaratildi");
  } else {
    logger.info({ branchId: String(main._id) }, "Asosiy filial allaqachon mavjud");
  }
  const MAIN_ID = main._id;

  // --- 2) Filialga bog'lanadigan modellarni to'ldirish ---
  // DIQQAT: collection.updateMany ishlatiladi (Mongoose validatsiyasini
  // aylanib o'tish uchun) - branchId endi required, lekin eski hujjatlarda
  // u yo'q, ya'ni model orqali saqlash validatsiya xatosi berardi.
  const targets = [
    ["Group", Group],
    ["Lead", Lead],
    ["StudentPayment", StudentPayment],
    ["PaymentTransaction", PaymentTransaction],
    ["TeacherSalary", TeacherSalary],
    ["SalaryTransaction", SalaryTransaction],
  ];

  for (const [name, Model] of targets) {
    const res = await Model.collection.updateMany(
      { branchId: { $exists: false } },
      { $set: { branchId: MAIN_ID } },
    );
    logger.info({ model: name, updated: res.modifiedCount }, "branchId to'ldirildi");
  }

  // --- 3) Foydalanuvchilarni asosiy filialga biriktirish ---
  // homeBranchId = asosiy filial. branchAssignments BO'SH qoladi:
  // bo'sh massiv "faqat homeBranchId'da ishlaydi" degani, ortiqcha
  // ma'lumot saqlashning hojati yo'q.
  const userRes = await User.collection.updateMany(
    { homeBranchId: { $exists: false } },
    { $set: { homeBranchId: MAIN_ID, branchAssignments: [] } },
  );
  logger.info({ updated: userRes.modifiedCount }, "Foydalanuvchilar filialga biriktirildi");

  // null bo'lib qolganlarni ham to'ldiramiz (qisman migratsiya bo'lgan bo'lsa)
  const userNullRes = await User.collection.updateMany(
    { homeBranchId: null },
    { $set: { homeBranchId: MAIN_ID } },
  );
  if (userNullRes.modifiedCount) {
    logger.info({ updated: userNullRes.modifiedCount }, "null homeBranchId to'ldirildi");
  }

  // --- 3b) Depozit ledgeri ---
  // DepositTransaction.branchId `required: false` (o'quvchi filialsiz bo'lishi
  // mumkin), lekin eski yozuvlarni ham asosiy filialga biriktiramiz - aks holda
  // ular hisobotlarda "filialsiz" bo'lib chiqib ketardi.
  const depRes = await DepositTransaction.collection.updateMany(
    { $or: [{ branchId: { $exists: false } }, { branchId: null }] },
    { $set: { branchId: MAIN_ID } },
  );
  logger.info({ updated: depRes.modifiedCount }, "Depozit yozuvlari filialga biriktirildi");

  // --- 4) Indekslarni sinxronlash ---
  // Yangi branchId indekslari fon rejimida quriladi.
  for (const [name, Model] of [
    ...targets,
    ["DepositTransaction", DepositTransaction],
    ["User", User],
    ["Branch", Branch],
  ]) {
    try {
      await Model.syncIndexes();
      logger.info({ model: name }, "Indekslar sinxronlandi");
    } catch (err) {
      logger.warn({ model: name, msg: err?.message }, "Indeks sinxronlashda ogohlantirish");
    }
  }

  // --- 5) Tekshiruv: to'ldirilmagan hujjat qolmaganini tasdiqlash ---
  let leftovers = 0;
  for (const [name, Model] of targets) {
    const n = await Model.collection.countDocuments({ branchId: { $exists: false } });
    if (n > 0) {
      leftovers += n;
      logger.error({ model: name, count: n }, "DIQQAT: branchId'siz hujjat qoldi");
    }
  }

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  if (leftovers > 0) {
    logger.error({ leftovers }, `Migratsiya TUGALLANMADI (${secs}s)`);
    await disconnectDB();
    process.exit(1);
  }

  logger.info(`Filial migratsiyasi tayyor (${secs}s)`);
  await disconnectDB();
};

migrate().catch((err) => {
  logger.error({ err }, "Filial migratsiya xato");
  process.exit(1);
});
