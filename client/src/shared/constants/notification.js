// Notification domain constants

export const NOTIFICATION_CATEGORIES = [
  "payment_reminder",
  "debt_warning",
  "class_cancel",
  "announcement",
  "admin_personal",
  "teacher_message",
  "feedback_status",
  "holiday",
  "attendance",
  "template_based",
  "other",
];

export const CATEGORY_LABEL = {
  payment_reminder: "To'lov eslatmasi",
  debt_warning: "Qarz ogohlantirishi",
  class_cancel: "Dars bekor qilindi",
  announcement: "E'lon",
  admin_personal: "Shaxsiy xabar",
  teacher_message: "O'qituvchi xabari",
  feedback_status: "Feedback holati",
  holiday: "Bayram tabrigi",
  attendance: "Davomat",
  template_based: "Shablonli xabar",
  other: "Boshqa",
};

export const CATEGORY_BADGE_CLASS = {
  payment_reminder: "bg-amber-100 text-amber-800",
  debt_warning: "bg-red-100 text-red-700",
  class_cancel: "bg-orange-100 text-orange-800",
  announcement: "bg-blue-100 text-blue-800",
  admin_personal: "bg-violet-100 text-violet-700",
  teacher_message: "bg-cyan-100 text-cyan-700",
  feedback_status: "bg-slate-100 text-slate-700",
  holiday: "bg-pink-100 text-pink-700",
  attendance: "bg-teal-100 text-teal-700",
  template_based: "bg-indigo-100 text-indigo-700",
  other: "bg-gray-100 text-gray-700",
};

export const CATEGORY_EMOJI = {
  payment_reminder: "💰",
  debt_warning: "⚠️",
  class_cancel: "❌",
  announcement: "📢",
  admin_personal: "✉️",
  teacher_message: "👨‍🏫",
  feedback_status: "📝",
  holiday: "🎉",
  attendance: "📋",
  template_based: "📨",
  other: "📨",
};

export const CATEGORY_OPTIONS = NOTIFICATION_CATEGORIES.map((c) => ({
  value: c,
  label: CATEGORY_LABEL[c],
}));

export const AUDIENCE_TYPES = [
  "all_students",
  "all_teachers",
  "groups",
  "users",
  "individual",
  "feedback_author",
  "auto_system",
];

export const AUDIENCE_TYPE_LABEL = {
  all_students: "Barcha o'quvchilar",
  all_teachers: "Barcha o'qituvchilar",
  groups: "Guruh(lar) bo'yicha",
  users: "Tanlangan foydalanuvchilar",
  individual: "Bitta foydalanuvchi",
  feedback_author: "Feedback muallifi",
  auto_system: "Avto-tizim",
};

// ───────────────────────────────────────────────────────────────────────────
// Kanallar (yetkazish usuli)
// ───────────────────────────────────────────────────────────────────────────
export const CHANNELS = ["inapp", "telegram"];

export const CHANNEL_LABEL = {
  inapp: "Platforma (Ilova ichida)",
  telegram: "Telegram bot",
};

export const CHANNEL_SHORT_LABEL = {
  inapp: "Platforma",
  telegram: "Telegram",
};

// ───────────────────────────────────────────────────────────────────────────
// Yuborish holati - modul bo'yicha YAGONA status rang tizimi.
//   sent      -> yashil  (yuborildi / faol)
//   scheduled -> sariq   (kutilmoqda / rejalashtirilgan)
//   canceled  -> qizil   (bekor qilingan)
//   auto      -> kulrang (avto-tizim)
// StatusBadge `tone` qiymatlari bilan moslashtirilgan.
// ───────────────────────────────────────────────────────────────────────────
export const STATUS_LABEL = {
  sent: "Yuborildi",
  scheduled: "Rejalashtirilgan",
  canceled: "Bekor qilingan",
};

// Yagona status rang tizimi:
//   sent      -> success (yashil)
//   scheduled -> info    (ko'k)
//   canceled  -> neutral (kulrang)
//   isAuto    -> neutral (neytral kulrang, resolveStatusTone'da)
export const STATUS_TONE = {
  sent: "success",
  scheduled: "info",
  canceled: "neutral",
};

// Avto-tizim xabarini (isAuto) kulrang ko'rsatish uchun yordamchi.
export const resolveStatusTone = ({ status, isAuto } = {}) => {
  if (isAuto) return "neutral";
  return STATUS_TONE[status] || "neutral";
};

export const resolveStatusLabel = ({ status, isAuto } = {}) => {
  if (isAuto && status === "sent") return "Avto-tizim";
  return STATUS_LABEL[status] || STATUS_LABEL.sent;
};

// ───────────────────────────────────────────────────────────────────────────
// Bot yetkazilmaganlik sabablari (botFailedReason) - texnik qiymatlarni
// admin tushunadigan o'zbekcha matnga o'giradi.
//   no-bot-link     -> foydalanuvchi botni ulamagan (/start bosmagan)
//   blocked         -> foydalanuvchi botni bloklagan
//   bot-not-running -> bot vaqtincha ishlamayapti (transient, odatda saqlanmaydi)
// Qolgan qiymatlar Telegram'dan kelgan xom xato matni (chat not found, ...) -
// ularni naqsh bo'yicha aniqlaymiz.
// ───────────────────────────────────────────────────────────────────────────
export const BOT_FAIL_REASON_LABEL = {
  "no-bot-link": "Bot ulanmagan",
  blocked: "Bot bloklangan",
  "bot-not-running": "Bot vaqtincha ishlamadi",
  "send-failed": "Yuborishda xato",
};

// botFailedReason qiymatini o'zbekcha matnga o'giradi. Aniq kalit topilmasa,
// Telegram'ning xom matnidan ma'noni naqsh bo'yicha aniqlashga harakat qiladi.
export const formatBotFailReason = (reason) => {
  if (!reason) return "";
  const known = BOT_FAIL_REASON_LABEL[reason];
  if (known) return known;

  const r = String(reason).toLowerCase();
  if (/bot was blocked|user is deactivated|bot can't initiate|forbidden/.test(r))
    return "Bot bloklangan";
  if (/chat not found|user not found/.test(r)) return "Foydalanuvchi topilmadi";
  if (/too many requests|retry after|429/.test(r)) return "Limit oshib ketdi";
  if (/deactivated/.test(r)) return "Hisob o'chirilgan";
  // Noma'lum xato - umumiy matn (xom inglizcha matnni adminga ko'rsatmaymiz)
  return "Yuborishda xato";
};

// ───────────────────────────────────────────────────────────────────────────
// Xabar o'zgaruvchilari (placeholder) - matnda {ism} kabi qo'llanadi.
// preview'da namuna qiymat bilan almashtiriladi.
// ───────────────────────────────────────────────────────────────────────────
export const MESSAGE_VARIABLES = [
  { token: "{ism}", label: "Ism", sample: "Aziz" },
  { token: "{familiya}", label: "Familiya", sample: "Karimov" },
  { token: "{guruh}", label: "Guruh", sample: "Bayyina-1" },
  { token: "{qarz}", label: "Qarz", sample: "450 000 so'm" },
  { token: "{markaz}", label: "Markaz", sample: "Bayyina" },
];

// preview uchun: {token}larni namuna qiymatlar bilan almashtiradi.
export const fillSampleVariables = (text = "") =>
  MESSAGE_VARIABLES.reduce(
    (acc, v) => acc.split(v.token).join(v.sample),
    String(text || ""),
  );

// Template kategoriyalari (alohida - notification kategoriyalaridan farq qiladi)
export const TEMPLATE_CATEGORIES = [
  "payment",
  "debt",
  "class_cancel",
  "announcement",
  "holiday",
  "personal",
  "feedback_status",
  "custom",
];

export const TEMPLATE_CATEGORY_LABEL = {
  payment: "To'lov",
  debt: "Qarz",
  class_cancel: "Dars bekor qilindi",
  announcement: "E'lon",
  holiday: "Bayram",
  personal: "Shaxsiy",
  feedback_status: "Feedback",
  custom: "Boshqa",
};

export const TEMPLATE_CATEGORY_OPTIONS = TEMPLATE_CATEGORIES.map((c) => ({
  value: c,
  label: TEMPLATE_CATEGORY_LABEL[c],
}));

export const HOLIDAY_AUDIENCES = ["all", "students", "teachers"];

export const HOLIDAY_AUDIENCE_LABEL = {
  all: "Hammaga",
  students: "O'quvchilarga",
  teachers: "O'qituvchilarga",
};

export const HOLIDAY_AUDIENCE_OPTIONS = HOLIDAY_AUDIENCES.map((a) => ({
  value: a,
  label: HOLIDAY_AUDIENCE_LABEL[a],
}));

export const MONTH_OPTIONS = [
  { value: 1, label: "Yanvar" },
  { value: 2, label: "Fevral" },
  { value: 3, label: "Mart" },
  { value: 4, label: "Aprel" },
  { value: 5, label: "May" },
  { value: 6, label: "Iyun" },
  { value: 7, label: "Iyul" },
  { value: 8, label: "Avgust" },
  { value: 9, label: "Sentyabr" },
  { value: 10, label: "Oktyabr" },
  { value: 11, label: "Noyabr" },
  { value: 12, label: "Dekabr" },
];
