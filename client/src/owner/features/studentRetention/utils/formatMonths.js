// Oy (kasr) ni "1 yil 3 oy" ko'rinishida o'qishli matnga aylantiradi.
export const formatMonths = (months) => {
  if (!months || months <= 0) return "0 oy";
  const total = Math.round(months);
  const y = Math.floor(total / 12);
  const m = total - y * 12;
  const parts = [];
  if (y > 0) parts.push(`${y} yil`);
  if (m > 0) parts.push(`${m} oy`);
  return parts.join(" ") || "0 oy";
};
