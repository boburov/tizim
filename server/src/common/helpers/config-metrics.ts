/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMA O'LCHOVLARI — delegatsiya chegarasi NIMAGA solishtirilishini
 * aniqlaydi (`helpers/configMetrics.helper.js` KO'CHIRMASI).
 *
 * NEGA ALOHIDA FAYL: har bir tur o'z body shakliga ega (chegirmada
 * `value`, guruh narxida `amount`, maoshda `baseAmount` + `variableRate`).
 * Bu xaritalash kontrollerlar ichiga tarqalib ketsa, birida `percent`
 * unutilib qolardi va chegara JIMGINA qo'llanmasdan o'tib ketardi —
 * ya'ni chegara bor deb o'ylagan owner aslida himoyasiz qolardi.
 *
 * SHARTNOMA: `{ amount?: number, percent?: number }`.
 * ⚠ Aniqlanmagan maydon UMUMAN QO'SHILMAYDI (`undefined` emas, YO'Q) —
 * shunda `withinLimit` FAIL-CLOSED ishlaydi va tasdiqqa yuboradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ConfigMetrics {
  amount?: number;
  percent?: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const build = (amount: number | null, percent: number | null): ConfigMetrics => {
  const out: ConfigMetrics = {};
  if (amount !== null) out.amount = amount;
  if (percent !== null) out.percent = percent;
  return out;
};

/**
 * CHEGIRMA: `type` foiz bo'lsa `value` foiz, aks holda so'm.
 * Tahrirlashda `type` yoki `value` bo'lmasligi mumkin — u holda BO'SH
 * o'lchov qaytadi va o'zgarish tasdiqqa tushadi (ataylab).
 */
export const discountMetrics = (body: Record<string, unknown> = {}): ConfigMetrics => {
  const value = num(body.value);
  if (value === null || !body.type) return {};
  return body.type === 'percent' ? build(null, value) : build(value, null);
};

/** GURUH NARXI: bitta summa. Chegara POL (`minAmount`) sifatida qo'llanadi. */
export const groupFeeMetrics = (body: Record<string, unknown> = {}): ConfigMetrics =>
  build(num(body.amount), null);

/** MAOSH STAVKASI (guruh davri): `salaryType` fixed | percent | mixed. */
export const salaryTermsMetrics = (body: Record<string, unknown> = {}): ConfigMetrics =>
  build(num(body.fixedAmount), num(body.percentRate));

/**
 * O'QITUVCHI STANDART STAVKASI.
 *
 * ⚠ `variableRate` IKKI MA'NOLI: `variableType === "percent"` bo'lsa
 * FOIZ, aks holda SO'M (`per_student` / `per_lesson_hour` / `per_group`).
 * Shuning uchun u turiga qarab tegishli tomonga yo'naltiriladi — aks
 * holda 50 000 so'mlik "har o'quvchi uchun" stavkasi 50 000 FOIZ deb
 * o'qilib, chegara tekshiruvi ma'nosiz bo'lardi.
 *
 * So'm tomonida `baseAmount` bilan `variableRate` ning KATTASI olinadi —
 * ikkalasi ham xarajat yaratadi va chegara ikkalasini qamrashi kerak.
 */
export const compensationMetrics = (
  body: Record<string, unknown> = {},
): ConfigMetrics => {
  const base = num(body.baseAmount);
  const rate = num(body.variableRate);
  const isPercent = body.variableType === 'percent';

  const percent = isPercent ? rate : null;
  const rateAsAmount = isPercent ? null : rate;

  const amounts = [base, rateAsAmount].filter((v): v is number => v !== null);
  const amount = amounts.length ? Math.max(...amounts) : null;

  return build(amount, percent);
};
