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
