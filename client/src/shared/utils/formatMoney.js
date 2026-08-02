export const formatMoney = (n) => {
  const num = Number(n) || 0;
  // 250000 → "250 000 so'm"
  return `${num.toLocaleString("uz-UZ").replace(/[ ,]/g, " ")} so'm`;
};

/**
 * QISQA PUL FORMATI - ijroiya kartalari uchun.
 *
 * NEGA KERAK: "48 200 000 so'm" o'n uch belgi va u KPI kartasining
 * sarlavhasidan ham uzun bo'lib ketadi - natijada raqam ikki qatorga
 * tushadi va kartalar tengsiz balandlikda turadi. "48,2 mln so'm" esa
 * bir qarashda o'qiladi.
 *
 * MILLIONDAN KICHIK summalar TO'LIQ ko'rsatiladi: "0,45 mln" hech kim
 * o'ylamaydigan shakl, "450 000" esa tabiiy.
 */
export const formatMoneyShort = (n) => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? "−" : "";

  const short = (value, unit) =>
    `${sign}${value.toLocaleString("uz-UZ", { maximumFractionDigits: 1 })} ${unit} so'm`;

  if (abs >= 1_000_000_000) return short(abs / 1_000_000_000, "mlrd");
  if (abs >= 1_000_000) return short(abs / 1_000_000, "mln");
  return formatMoney(num);
};
