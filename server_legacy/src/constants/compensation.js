/**
 * MAOSH STAVKASI - domen lug'ati.
 *
 * `models/teacherCompensation.model.js` dan ko'chirildi: bu ro'yxatlar
 * bazaga bog'liq emas va Mongoose model fayllari migratsiya oxirida
 * o'chiriladi. Jadval tuzilmasi endi `prisma/schema.prisma` da.
 *
 * QIYMATLAR SXEMADAGI ENUMLAR BILAN AYNAN BIR XIL BO'LISHI SHART:
 *   CompBaseType, CompVariableType, CompPercentBase.
 * Bu yerga yangi tur qo'shish avval Prisma enumiga qo'shishni talab
 * qiladi - aks holda validator qabul qilgan qiymat bazada rad etiladi.
 */

// Markaz darajasidagi FIKSA qism.
export const COMP_BASE_TYPES = ["none", "fixed_monthly"];

// O'ZGARUVCHI qism - "nimaga ko'paytiriladi" (qarang variableBase.helper.js).
export const COMP_VARIABLE_TYPES = [
  "none",
  "percent",
  "per_student",
  "per_lesson_hour",
  "per_group",
];

// Foiz qaysi bazadan olinadi:
//   billed    - hisoblangan (o'quvchi to'lamasa ham o'qituvchi oladi)
//   collected - haqiqatda kassaga tushgan
export const COMP_PERCENT_BASES = ["billed", "collected"];
