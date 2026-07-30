// Davomat status meta
export const ATTENDANCE_STATUSES = ["present", "absent", "excused", "exempt"];

export const STATUS_LABEL = {
  present: "Keldi",
  absent: "Kelmadi",
  excused: "Sababli",
  exempt: "Ozod",
};

export const STATUS_BADGE_CLASS = {
  present: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  absent: "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300",
  excused: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  exempt: "bg-muted text-muted-foreground",
};

// To'liq to'ldirilgan nuqta/katak ranglari (matritsada ko'rinarli bo'lsin)
export const STATUS_DOT_CLASS = {
  present: "bg-emerald-500",
  absent: "bg-rose-500",
  excused: "bg-amber-500",
  exempt: "bg-muted-foreground/50",
};

export const STATUS_EMOJI = {
  present: "✓",
  absent: "✕",
  excused: "!",
  exempt: "-",
};

export const STATUS_OPTIONS = ATTENDANCE_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

export const DAY_OPTIONS = [
  { value: "mon", label: "Dushanba" },
  { value: "tue", label: "Seshanba" },
  { value: "wed", label: "Chorshanba" },
  { value: "thu", label: "Payshanba" },
  { value: "fri", label: "Juma" },
  { value: "sat", label: "Shanba" },
  { value: "sun", label: "Yakshanba" },
];

export const DAY_SHORT = {
  mon: "Du",
  tue: "Se",
  wed: "Ch",
  thu: "Pa",
  fri: "Ju",
  sat: "Sh",
  sun: "Ya",
};
