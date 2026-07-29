// Utils
import { formatMoney } from "@/shared/utils/formatMoney";

// Sozlama so'rovining MAZMUNI - summa o'rniga shu ko'rsatiladi.
// Maosh stavkasi takrorlanuvchi, uni bitta raqam bilan ifodalab bo'lmaydi.
const describeSalaryTerms = (payload = {}) => {
  const parts = [];
  if (payload.salaryType === "fixed" || payload.salaryType === "mixed") {
    parts.push(`Fiksa ${formatMoney(payload.fixedAmount || 0)}`);
  }
  if (payload.salaryType === "percent" || payload.salaryType === "mixed") {
    parts.push(`${payload.percentRate || 0}% tushumdan`);
  }
  return parts.join(" + ") || "Stavka ko'rsatilmagan";
};

const describeDiscount = (payload = {}) => {
  const value =
    payload.type === "percent"
      ? `${payload.value || 0}% chegirma`
      : `${formatMoney(payload.value || 0)} chegirma`;
  const period =
    payload.scope === "monthly" && payload.month
      ? ` (${payload.month}/${payload.year})`
      : " (doimiy)";
  return value + period;
};

// DIQQAT: parol payload'da bo'lsa ham server uni o'qish javoblaridan
// kesib tashlaydi (stripSensitive) - bu yerda ham hech qachon ko'rsatilmaydi.
const describeHire = (payload = {}) =>
  `${payload.role || "xodim"} — ${payload.username || ""}`;

// Owner uchun eng muhimi "qanchadan qanchaga" - shuning uchun eski narx ham
// ko'rsatiladi (so'rov paytida snapshot qilingan).
const describeGroupFee = (payload = {}) => {
  const next = formatMoney(payload.amount || 0);
  if (payload.previousAmount === null || payload.previousAmount === undefined) {
    return next;
  }
  return `${formatMoney(payload.previousAmount)} → ${next}`;
};

const CONFIG_SUMMARY = {
  salary_terms: describeSalaryTerms,
  discount_set: describeDiscount,
  group_fee_set: describeGroupFee,
  staff_hire: describeHire,
};

/**
 * So'rovning "sarlavha qiymati" - jadval, karta, toast va batafsil
 * panelida BIR XIL chiqishi uchun yagona manba.
 *
 * Sozlama so'rovida summa YO'Q (amount = null) - "0 so'm" ko'rsatish
 * noto'g'ri bo'lardi, uning o'rniga o'zgarish mazmuni chiqadi.
 */
export const approvalHeadline = (approval) => {
  if (!approval) return "";
  if (approval.category === "configuration") {
    return (
      CONFIG_SUMMARY[approval.kind]?.(approval.payload) ?? "Sozlama o'zgarishi"
    );
  }
  return formatMoney(approval.amount);
};

export const fullName = (u) =>
  u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.username : "—";

export const initials = (u) => {
  if (!u) return "?";
  const first = u.firstName?.[0] || u.username?.[0] || "?";
  const last = u.lastName?.[0] || "";
  return `${first}${last}`.toUpperCase();
};
