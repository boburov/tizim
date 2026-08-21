/**
 * LID STATUSLARI — `server/src/constants/leadStatus.js` NING AYNAN
 * KO'CHIRMASI.
 *
 * ⚠ QIYMATLAR STATIK VA O'ZGARMAS. Ular Prisma enum'lari bilan bir xil
 * bo'lishi SHART; qo'shish/olib tashlash mavjud lid yozuvlarini
 * yaroqsiz qilardi.
 */
export const LEAD_STATUSES = [
  'new',
  'info_given',
  'trial',
  'trial_attended',
  'enrolled',
  'recontacted',
  'rejected',
] as const;

/** Savdo voronkasi (chiziqli bosqichlar tartibi) — analitika uchun. */
export const LEAD_PIPELINE = [
  'new',
  'info_given',
  'trial',
  'trial_attended',
  'enrolled',
] as const;

export const LEAD_OPTION_KINDS = ['source', 'direction', 'rejection'] as const;
