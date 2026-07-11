// Hisobot vaqt filtri uchun preset -> { fromDate, toDate } (ISO) hisoblovchi util.

export const TIME_PRESETS = [
  { value: "all", label: "Hammasi" },
  { value: "today", label: "Bugun" },
  { value: "week", label: "Hafta" },
  { value: "month", label: "Oy" },
  { value: "range", label: "Diapazon" },
];

const pad = (n) => String(n).padStart(2, "0");
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "Diapazon" tanlanganda default to'ldiriladigan oraliq: oxirgi 30 kun.
export const defaultCustomRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return { from: toInput(from), to: toInput(to) };
};

export const resolveRange = (preset, custom = {}) => {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  if (preset === "today") {
    return { fromDate: startOfToday.toISOString(), toDate: now.toISOString() };
  }
  if (preset === "week") {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() - 6);
    return { fromDate: d.toISOString(), toDate: now.toISOString() };
  }
  if (preset === "month") {
    const d = new Date(startOfToday);
    d.setMonth(d.getMonth() - 1);
    return { fromDate: d.toISOString(), toDate: now.toISOString() };
  }
  if (preset === "range") {
    return {
      fromDate: custom.from ? new Date(custom.from).toISOString() : undefined,
      toDate: custom.to
        ? new Date(`${custom.to}T23:59:59`).toISOString()
        : undefined,
    };
  }
  return { fromDate: undefined, toDate: undefined };
};
