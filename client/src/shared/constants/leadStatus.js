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
  new: "bg-sky-100 text-sky-700",
  info_given: "bg-indigo-100 text-indigo-700",
  trial: "bg-amber-100 text-amber-700",
  trial_attended: "bg-violet-100 text-violet-700",
  enrolled: "bg-green-100 text-green-700",
  recontacted: "bg-cyan-100 text-cyan-700",
  rejected: "bg-rose-100 text-rose-700",
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
