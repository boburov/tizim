// Lid statuslari - statik (backend bilan bir xil)
export const LEAD_STATUSES = [
  "new",
  "info_given",
  "trial",
  "trial_attended",
  "enrolled",
  "recontacted",
  "rejected",
];

export const LEAD_STATUS_LABEL = {
  new: "Yangi",
  info_given: "Ma'lumot berildi",
  trial: "Sinov darsida",
  trial_attended: "Sinovda qatnashdi",
  enrolled: "Guruhga qo'shildi",
  recontacted: "Qayta bog'lanildi",
  rejected: "Rad etildi",
};

// Badge uchun rang sinflari
export const LEAD_STATUS_TONE = {
  new: "bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  info_given: "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  trial: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
  trial_attended: "bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  enrolled: "bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-300",
  recontacted: "bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  rejected: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

// Voronka (chiziqli bosqichlar tartibi)
export const LEAD_PIPELINE = [
  "new",
  "info_given",
  "trial",
  "trial_attended",
  "enrolled",
];

export const LEAD_STATUS_OPTIONS = LEAD_STATUSES.map((v) => ({
  value: v,
  label: LEAD_STATUS_LABEL[v],
}));
