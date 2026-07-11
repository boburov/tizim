export const formatMoney = (n) => {
  const num = Number(n) || 0;
  // 250000 → "250 000 so'm"
  return `${num.toLocaleString("uz-UZ").replace(/[ ,]/g, " ")} so'm`;
};
