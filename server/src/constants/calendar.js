// Oy nomlari - o'zbekcha, 0-indeksli (0 = yanvar).
//
// Bitta manba: ilgari bu ro'yxat har bir hisobot servisida qayta
// yozilardi va "sentabr"/"sentyabr" kabi farqlar bir sahifada yonma-yon
// chiqib qolardi.
export const MONTH_NAMES_UZ = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avgust",
  "sentabr",
  "oktabr",
  "noyabr",
  "dekabr",
];

/** 1-indeksli oy raqamidan nom ("2026-08" → "avgust"). */
export const monthNameUz = (month) => MONTH_NAMES_UZ[(month - 1 + 12) % 12];

/**
 * HAFTA KUNLARI - DUSHANBADAN boshlab, guruh jadvali uchun.
 *
 * NEGA `models/group.model.js` DAN KO'CHIRILDI: bu sof lug'at, bazaga
 * bog'liq emas. Mongoose model fayllari migratsiya oxirida o'chiriladi,
 * konstanta esa validator va hisobotlarda qolishi kerak.
 *
 * TARTIB MUHIM: `pulse.signal.js` va `group.signal.js` indeks bo'yicha
 * murojaat qiladi (`GROUP_DAYS[dowIndex]`), shuning uchun bu qatorni
 * qayta tartiblash MUMKIN EMAS.
 *
 * Qiymatlar `prisma/schema.prisma`dagi `enum WeekDay` bilan AYNAN
 * bir xil bo'lishi shart - ular to'g'ridan-to'g'ri bazaga yoziladi.
 */
export const GROUP_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
