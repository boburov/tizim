/**
 * MAOSH STAVKASI — domen lug'ati (`constants/compensation.js` KO'CHIRMASI).
 *
 * ⚠ QIYMATLAR PRISMA ENUMLARI BILAN AYNAN BIR XIL BO'LISHI SHART:
 * `CompBaseType`, `CompVariableType`, `CompPercentBase`. Bu yerga yangi
 * tur qo'shish AVVAL Prisma enumiga qo'shishni talab qiladi — aks holda
 * validator qabul qilgan qiymat bazada rad etiladi.
 */

/** Markaz darajasidagi FIKSA qism. */
export const COMP_BASE_TYPES = ['none', 'fixed_monthly'] as const;

/** O'ZGARUVCHI qism — "nimaga ko'paytiriladi". */
export const COMP_VARIABLE_TYPES = [
  'none',
  'percent',
  'per_student',
  'per_lesson_hour',
  'per_group',
] as const;

/**
 * Foiz qaysi bazadan olinadi:
 *   `billed`    — hisoblangan (o'quvchi to'lamasa ham o'qituvchi oladi)
 *   `collected` — haqiqatda kassaga tushgan
 */
export const COMP_PERCENT_BASES = ['billed', 'collected'] as const;

export type CompBaseType = (typeof COMP_BASE_TYPES)[number];
export type CompVariableType = (typeof COMP_VARIABLE_TYPES)[number];
export type CompPercentBase = (typeof COMP_PERCENT_BASES)[number];
