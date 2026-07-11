// preset -> { from, to } (ISO) yoki {} (umumiy)
// "month" uchun aniq yil va oy tanlanadi
export const resolvePeriod = (preset, { year, month } = {}) => {
  if (preset === "all") return {};

  if (preset === "month") {
    const now = new Date();
    const y = year || now.getFullYear();
    const m = month || now.getMonth() + 1;
    const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
    const to = new Date(y, m, 0, 23, 59, 59, 999);
    return { from: from.toISOString(), to: to.toISOString() };
  }

  // week - oxirgi 7 kun
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
};
