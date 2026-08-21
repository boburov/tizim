/**
 * BAYRAM AUDITORIYALARI — `server/src/constants/calendar.js` dan.
 *
 * ⚠ Prisma `HolidayAudience` enum'i bilan AYNAN bir xil bo'lishi SHART.
 */
export const HOLIDAY_AUDIENCES = ['all', 'students', 'teachers'] as const;

/**
 * OY NOMLARI — o'zbekcha, 0-indeksli (0 = yanvar).
 *
 * `server/src/constants/calendar.js` dan AYNAN ko'chirildi. Hisobot va
 * brifing matnlari shu ro'yxatdan oziqlanadi — ikkinchi nusxa paydo
 * bo'lsa bir sahifada "sentabr"/"sentyabr" yonma-yon chiqib qolardi.
 */
export const MONTH_NAMES_UZ = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

/** 1-indeksli oy raqamidan nom ("2026-08" → "avgust"). */
export const monthNameUz = (month: number): string =>
  MONTH_NAMES_UZ[(month - 1 + 12) % 12];

/**
 * HAFTA KUNLARI — DUSHANBADAN boshlab, guruh jadvali uchun.
 *
 * ⚠ TARTIB MUHIM: `pulse.signal` va `group.signal` INDEKS bo'yicha
 * murojaat qiladi (`GROUP_DAYS[dowIndex]`) — qatorni qayta tartiblash
 * jimgina noto'g'ri kunni qaytarardi.
 *
 * Qiymatlar `prisma/schema.prisma` dagi `enum WeekDay` bilan AYNAN bir
 * xil bo'lishi SHART — ular to'g'ridan-to'g'ri bazaga yoziladi.
 */
export const GROUP_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
