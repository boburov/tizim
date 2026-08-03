// MAOSH STAVKASI - umumiy konstantalar va formatlash.
//
// Bu yerdagi qiymatlar SERVER enum'lari bilan aynan bir xil bo'lishi shart
// (server/src/models/teacherCompensation.model.js). Farq qilsa 400 xatosi
// chiqadi va foydalanuvchi sababini tushunmaydi.

export const BASE_TYPES = Object.freeze({
  NONE: "none",
  FIXED_MONTHLY: "fixed_monthly",
});

export const VARIABLE_TYPES = Object.freeze({
  NONE: "none",
  PERCENT: "percent",
  PER_STUDENT: "per_student",
  PER_LESSON_HOUR: "per_lesson_hour",
  PER_GROUP: "per_group",
});

export const BASE_TYPE_OPTIONS = [
  { value: BASE_TYPES.NONE, label: "Fiksa yo'q" },
  { value: BASE_TYPES.FIXED_MONTHLY, label: "Oylik fiksa" },
];

export const VARIABLE_TYPE_OPTIONS = [
  { value: VARIABLE_TYPES.NONE, label: "O'zgaruvchi qism yo'q" },
  { value: VARIABLE_TYPES.PERCENT, label: "Guruh tushumidan foiz" },
  { value: VARIABLE_TYPES.PER_STUDENT, label: "Har bir o'quvchi uchun" },
  { value: VARIABLE_TYPES.PER_LESSON_HOUR, label: "Har bir dars soati uchun" },
  { value: VARIABLE_TYPES.PER_GROUP, label: "Har bir guruh uchun" },
];

export const PERCENT_BASE_OPTIONS = [
  {
    value: "billed",
    label: "Hisoblangan (o'quvchi to'lamasa ham)",
  },
  {
    value: "collected",
    label: "Yig'ilgan (faqat kassaga tushgani)",
  },
];

// O'zgaruvchi stavka birligi - input yorlig'i uchun.
export const VARIABLE_UNIT = {
  [VARIABLE_TYPES.PERCENT]: "%",
  [VARIABLE_TYPES.PER_STUDENT]: "so'm / o'quvchi",
  [VARIABLE_TYPES.PER_LESSON_HOUR]: "so'm / dars soati",
  [VARIABLE_TYPES.PER_GROUP]: "so'm / guruh",
};

// Foiz turida input `number` (0-100), qolganlarida `money` (mingliklar ajratilgan).
export const isPercentType = (t) => t === VARIABLE_TYPES.PERCENT;

const nf = new Intl.NumberFormat("uz-UZ");
export const money = (n) => nf.format(Math.round(Number(n) || 0));

/**
 * Stavkani bitta o'qiladigan qatorga aylantiradi.
 * Masalan: "2 000 000 so'm/oy + 50 000 so'm/o'quvchi"
 */
export const describeCompensation = (comp) => {
  if (!comp) return "Belgilanmagan";
  const parts = [];
  if (comp.baseType === BASE_TYPES.FIXED_MONTHLY && comp.baseAmount > 0) {
    parts.push(`${money(comp.baseAmount)} so'm/oy`);
  }
  const t = comp.variableType;
  const rate = Number(comp.variableRate) || 0;
  if (t && t !== VARIABLE_TYPES.NONE && rate > 0) {
    if (t === VARIABLE_TYPES.PERCENT) {
      const base = comp.percentBase === "collected" ? "yig'ilgan" : "hisoblangan";
      parts.push(`guruh tushumining ${rate}% (${base})`);
    } else {
      parts.push(`${money(rate)} ${VARIABLE_UNIT[t] || ""}`.trim());
    }
  }
  return parts.length ? parts.join(" + ") : "Belgilanmagan";
};

/** Stavkada hech bo'lmasa bitta qism tanlanganmi (server ham shuni talab qiladi). */
export const hasAnyPart = (form) =>
  (form.baseType === BASE_TYPES.FIXED_MONTHLY && Number(form.baseAmount) > 0) ||
  (form.variableType !== VARIABLE_TYPES.NONE && Number(form.variableRate) > 0);

/** Forma holatidan server kutadigan payload yasaydi. */
export const toCompensationPayload = (form) => {
  const body = {
    baseType: form.baseType || BASE_TYPES.NONE,
    variableType: form.variableType || VARIABLE_TYPES.NONE,
  };
  if (body.baseType === BASE_TYPES.FIXED_MONTHLY) {
    body.baseAmount = Number(form.baseAmount) || 0;
  }
  if (body.variableType !== VARIABLE_TYPES.NONE) {
    body.variableRate = Number(form.variableRate) || 0;
    if (body.variableType === VARIABLE_TYPES.PERCENT) {
      body.percentBase = form.percentBase || "billed";
    }
  }
  if (form.effectiveFrom) body.effectiveFrom = form.effectiveFrom;
  if (form.note?.trim()) body.note = form.note.trim();
  return body;
};
