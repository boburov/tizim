import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import logger from "../config/logger.js";
import TeacherSalary from "../models/teacherSalary.model.js";
import SalaryTransaction from "../models/salaryTransaction.model.js";
import TeacherCompensation from "../models/teacherCompensation.model.js";

// BIR MARTALIK MIGRATSIYA: o'qituvchi maoshi markaz darajasidagi stavkaga
// (TeacherCompensation) o'tkazildi.
//
// ENG MUHIM KAFOLAT: BU MIGRATSIYA HECH QANDAY PULNI O'ZGARTIRMAYDI.
// Mavjud TeacherGroupPeriod yozuvlaridagi stavka joyida qoladi va rateResolver
// uni USTUNLIK (override) sifatida o'qiydi - ya'ni eski maoshlar aynan o'sha
// summada qayta hisoblanadi. TeacherCompensation hujjatlari bu yerda
// YARATILMAYDI: agar biz "hamma o'qituvchiga standart stavka" o'ylab topsak,
// keyingi recalc o'tgan oylarni yangi stavka bilan qayta yozib yuborardi.
// Standart stavka owner tomonidan ONGLI ravishda kiritilishi kerak.
//
// QILINADIGAN ISH:
//   1. Mavjud TeacherSalary hujjatlariga kind="group" qo'yish (default bilan
//      yozilmagan eski hujjatlar uchun).
//   2. Eski unique indeksni ({teacher,group,year,month}) o'chirish - u
//      group:null bo'lgan yangi qatorlar (base/bonus) bilan to'qnashardi.
//   3. syncIndexes - yangi partial unique indekslarni yaratish.
//
// IDEMPOTENT: bir necha marta ishga tushirilsa ham natija bir xil.

const migrate = async () => {
  await connectDB();
  const startedAt = Date.now();

  // ── 1) kind backfill ──
  // $exists:false - eski hujjatlarda maydon umuman yo'q. Schema default'i
  // FAQAT yangi hujjatga qo'llanadi, mavjudlarini o'zgartirmaydi.
  const kindRes = await TeacherSalary.collection.updateMany(
    { kind: { $exists: false } },
    { $set: { kind: "group" } },
  );
  logger.info(
    { updated: kindRes.modifiedCount },
    "TeacherSalary: kind='group' backfill qilindi",
  );

  // Ehtiyot chorasi: kind="group" bo'lib group=null qolgan hujjat bo'lmasligi
  // kerak (unique indeks yaratishda to'qnashardi). Bunday hujjat bo'lsa -
  // ma'lumot buzilgan, migratsiyani TO'XTATAMIZ va odam ko'rib chiqsin.
  const orphan = await TeacherSalary.countDocuments({
    kind: "group",
    $or: [{ group: null }, { group: { $exists: false } }],
  });
  if (orphan > 0) {
    logger.error(
      { orphan },
      "TO'XTATILDI: guruhsiz 'group' qatorlari bor. Ularni qo'lda ko'rib chiqing.",
    );
    await disconnectDB();
    process.exit(1);
  }

  // ── 2) Eski indekslarni o'chirish ──
  // Mongoose mavjud indeksning partialFilterExpression o'zgarishini
  // AVTOMATIK yangilamaydi - eskisini qo'lda o'chirish shart.
  const dropIfExists = async (Model, name, label) => {
    try {
      await Model.collection.dropIndex(name);
      logger.info(`${label}: eski indeks o'chirildi (${name})`);
    } catch (err) {
      logger.info({ msg: err?.message }, `${label}: ${name} topilmadi (o'tkazildi)`);
    }
  };

  await dropIfExists(
    TeacherSalary,
    "teacher_1_group_1_year_1_month_1",
    "TeacherSalary",
  );

  // ── 3) Yangi indekslar ──
  // syncIndexes schema'dagi indekslarni yaratadi va schema'da YO'Q bo'lganlarini
  // o'chiradi - shuning uchun yuqoridagi dropIndex'dan keyin chaqiriladi.
  await TeacherSalary.syncIndexes();
  logger.info("TeacherSalary: indekslar sinxronlandi");

  await SalaryTransaction.syncIndexes();
  logger.info("SalaryTransaction: indekslar sinxronlandi (group endi ixtiyoriy)");

  await TeacherCompensation.syncIndexes();
  logger.info("TeacherCompensation: indekslar yaratildi");

  // ── Yakuniy holat ──
  const [total, groupRows, baseRows, adjRows, compCount] = await Promise.all([
    TeacherSalary.countDocuments({}),
    TeacherSalary.countDocuments({ kind: "group" }),
    TeacherSalary.countDocuments({ kind: "base" }),
    TeacherSalary.countDocuments({ kind: { $in: ["bonus", "deduction"] } }),
    TeacherCompensation.countDocuments({ isDeleted: { $ne: true } }),
  ]);

  logger.info(
    {
      total,
      group: groupRows,
      base: baseRows,
      bonusOrDeduction: adjRows,
      compensations: compCount,
      ms: Date.now() - startedAt,
    },
    "Migratsiya yakunlandi. Pul summalari O'ZGARMADI - eski davr stavkalari ustunlik sifatida ishlaydi.",
  );

  await disconnectDB();
};

migrate().catch(async (err) => {
  logger.error({ err }, "Migratsiya xatosi");
  await disconnectDB();
  process.exit(1);
});
