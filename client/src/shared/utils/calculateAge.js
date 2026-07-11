// Sana asosida to'liq yoshni qaytaradi (UTC ichida, timezone tortilmaydi)
export const calculateAge = (dateLike) => {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;

  const today = new Date();
  let years = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
};
