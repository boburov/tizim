// Feedback domain constants

export const FEEDBACK_STATUSES = ["new", "in_review", "resolved", "rejected"];

export const FEEDBACK_STATUS_LABEL = {
  new: "Yangi",
  in_review: "Ko'rib chiqilmoqda",
  resolved: "Hal qilindi",
  rejected: "Rad etildi",
};

// Tor joylar (jadval/badge) uchun qisqa label - hech qachon sinmasin
export const FEEDBACK_STATUS_SHORT_LABEL = {
  new: "Yangi",
  in_review: "Ko'rilmoqda",
  resolved: "Hal qilindi",
  rejected: "Rad etildi",
};

// Har bir status -> semantik rang toni.
// StatusBadge, StatCard urg'usi va progress-bar shu yagona manbadan foydalanadi.
//   new        -> info     (ko'k)
//   in_review  -> warning  (amber)
//   resolved   -> success  (yashil)
//   rejected   -> danger   (qizil)
export const FEEDBACK_STATUS_TONE = {
  new: "info",
  in_review: "warning",
  resolved: "success",
  rejected: "danger",
};

export const FEEDBACK_STATUS_OPTIONS = FEEDBACK_STATUSES.map((s) => ({
  value: s,
  label: FEEDBACK_STATUS_LABEL[s],
}));
