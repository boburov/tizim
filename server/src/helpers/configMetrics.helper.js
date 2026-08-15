// SOZLAMA O'LCHOVLARI - delegatsiya chegarasi nimaga solishtirilishini
// aniqlaydi (qarang: constants/delegation.js va checkConfigApproval).
//
// NEGA ALOHIDA FAYL: har bir tur o'z body shakliga ega (chegirmada `value`,
// guruh narxida `amount`, maoshda `fixedAmount` + `percentRate`...). Bu
// xaritalash handler'lar ichida tarqalib ketsa, birida `percent` unutilib
// qolardi va chegara jimgina QO'LLANMASDAN o'tib ketardi - ya'ni chegara
// bor deb o'ylagan owner aslida himoyasiz qolardi.
//
// SHARTNOMA: { amount?: number, percent?: number }.
//   amount  - so'mdagi qiymat
//   percent - foizdagi qiymat (0-100)
// Ikkalasi ham bo'lishi mumkin (aralash maosh) - u holda IKKALASI ham
// o'z chegarasidan o'tishi shart.
//
// Aniqlanmagan maydon UMUMAN qo'shilmaydi (undefined emas, yo'q) - shunda
// withinLimit fail-closed ishlaydi va tasdiqqa yuboradi.

const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const build = (amount, percent) => {
  const out = {};
  if (amount !== null) out.amount = amount;
  if (percent !== null) out.percent = percent;
  return out;
};

/**
 * CHEGIRMA: `type` foiz bo'lsa `value` foiz, aks holda so'm.
 * Tahrirlashda `type` yoki `value` bo'lmasligi mumkin - u holda bo'sh
 * o'lchov qaytadi va o'zgarish tasdiqqa tushadi (ataylab).
 */
export const discountMetrics = (body = {}) => {
  const value = num(body.value);
  if (value === null || !body.type) return {};
  return body.type === "percent" ? build(null, value) : build(value, null);
};

/** GURUH NARXI: bitta summa. Chegara POL (minAmount) sifatida qo'llanadi. */
export const groupFeeMetrics = (body = {}) => build(num(body.amount), null);

/**
 * MAOSH STAVKASI (guruh davri): `salaryType` fixed | percent | mixed.
 * `mixed` da ikkala qism ham bo'ladi va ikkalasi ham tekshiriladi.
 */
export const salaryTermsMetrics = (body = {}) =>
  build(num(body.fixedAmount), num(body.percentRate));

/**
 * O'QITUVCHI STANDART STAVKASI.
 *
 * `variableRate` ikki ma'noli: `variableType === "percent"` bo'lsa foiz,
 * aks holda so'm (per_student / per_lesson_hour / per_group). Shuning uchun
 * u turiga qarab tegishli tomonga yo'naltiriladi.
 *
 * So'm tomonida `baseAmount` bilan `variableRate` ning KATTASI olinadi -
 * ikkalasi ham xarajat yaratadi, chegara esa ikkalasini ham qamrashi kerak.
 */
export const compensationMetrics = (body = {}) => {
  const base = num(body.baseAmount);
  const rate = num(body.variableRate);
  const isPercent = body.variableType === "percent";

  const percent = isPercent ? rate : null;
  const rateAsAmount = isPercent ? null : rate;

  const amounts = [base, rateAsAmount].filter((v) => v !== null);
  const amount = amounts.length ? Math.max(...amounts) : null;

  return build(amount, percent);
};
