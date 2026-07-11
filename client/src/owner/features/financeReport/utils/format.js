// Katta summalarni qisqartirib ko'rsatish: 2 400 000 -> "2.4 mln"
export const shortMoney = (n) => {
  const num = Number(n) || 0;
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")} mln`;
  if (num >= 1_000) return `${Math.round(num / 1_000)} ming`;
  return String(num);
};
