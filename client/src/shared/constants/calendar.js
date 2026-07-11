// Calendar/month labels - UI text (Uzbek), used across dashboards and pickers

export const MONTH_LABELS = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "Iyun",
  "Iyul",
  "Avgust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

export const MONTH_OPTIONS = MONTH_LABELS.map((label, i) => ({
  value: i + 1,
  label,
}));
