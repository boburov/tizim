// Permission keys (the seed writes the same keys to the DB)
export const PERMISSIONS = Object.freeze({
  USERS_READ: "users.read",
  ARCHIVE_REASONS_MANAGE: "archive_reasons.manage",

  LEADS_READ: "leads.read",
  LEADS_MANAGE: "leads.manage",

  STUDENTS_READ: "students.read",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",

  TEACHERS_READ: "teachers.read",
  TEACHERS_CREATE: "teachers.create",
  TEACHERS_UPDATE: "teachers.update",
  TEACHERS_DELETE: "teachers.delete",

  CLASSES_READ: "classes.read",
  CLASSES_CREATE: "classes.create",
  CLASSES_UPDATE: "classes.update",
  CLASSES_DELETE: "classes.delete",

  GROUPS_READ: "groups.read",
  GROUPS_CREATE: "groups.create",
  GROUPS_UPDATE: "groups.update",
  GROUPS_DELETE: "groups.delete",
  GROUPS_MANAGE_STUDENTS: "groups.manage_students",

  // Attendance
  ATTENDANCE_READ: "attendance.read",
  ATTENDANCE_RECORD: "attendance.record",
  ATTENDANCE_MANAGE: "attendance.manage",

  // Grades (baholash) + Rating (reyting)
  GRADES_READ: "grades.read",
  GRADES_RECORD: "grades.record",
  GRADES_MANAGE: "grades.manage",
  RATING_READ: "rating.read",
  RATING_MANAGE: "rating.manage",

  // Notifications + Feedback
  NOTIFICATIONS_READ: "notifications.read",
  NOTIFICATIONS_SEND: "notifications.send",
  NOTIFICATION_TEMPLATES_MANAGE: "notification_templates.manage",
  HOLIDAYS_MANAGE: "holidays.manage",
  FEEDBACK_READ: "feedback.read",
  FEEDBACK_RESPOND: "feedback.respond",
  FEEDBACK_TYPES_MANAGE: "feedback_types.manage",

  // Admin dashboard + audit (Bo'lak 9)
  ADMIN_DASHBOARD_READ: "admin_dashboard.read",
  ACTIVITY_LOGS_READ: "activity_logs.read",

  // Finance (Moliya)
  FINANCE_READ: "finance.read",
  FINANCE_PAY: "finance.pay",
  FINANCE_MANAGE: "finance.manage",

  // Teacher salary (O'qituvchi maoshlari)
  SALARY_READ: "salary.read",
  SALARY_PAY: "salary.pay",

  // Chiqim tasdig'i (limitdan oshgan to'lovlar).
  // FINANCE_APPROVE - tasdiqlash/rad etish huquqi. Bu ruxsat egasi limitdan
  // ham OZOD bo'ladi (u baribir o'zi tasdiqlay olardi).
  FINANCE_APPROVE: "finance.approve",

  // KONFIGURATSIYA tasdig'i (maosh stavkasi, chegirma - takrorlanuvchi ta'sir).
  // FINANCE_APPROVE dan ATAYLAB AJRATILGAN: kichik chiqimlarni tasdiqlash
  // huquqi berilgan direktor avtomatik ravishda o'ziga maosh stavkasi
  // belgilash huquqini OLMASLIGI kerak. Bu ruxsat egasi tasdiqdan ozod
  // bo'ladi (u baribir o'zi tasdiqlay olardi).
  APPROVALS_DECIDE_CONFIG: "approvals.decide_config",

  // Filiallar (Bo'lak: multi-branch)
  BRANCHES_READ: "branches.read",
  BRANCHES_CREATE: "branches.create",
  BRANCHES_UPDATE: "branches.update",
  BRANCHES_DELETE: "branches.delete",
  // BARCHA filiallarni birdan ko'rish (konsolidatsiya hisobotlar).
  // Bu ruxsatsiz foydalanuvchi faqat biriktirilgan filialini ko'radi.
  BRANCHES_VIEW_ALL: "branches.view_all",

  // Kurslar (yo'nalish katalogi)
  COURSES_READ: "courses.read",
  COURSES_MANAGE: "courses.manage",

  // AI maslahatchi.
  // AI_READ - insight/ball ko'rish. AI_ASSISTANT dan ATAYLAB ajratilgan:
  // assistent LLM chaqiradi (pul sarflaydi) va bir nechta modul ma'lumotini
  // birlashtira oladi, shuning uchun uni tor doiradagi xodimga bermaslik kerak.
  // AI_CONFIG - risk vaznlarini o'zgartirish: bu BARCHA ballarni siljitadi,
  // shuning uchun alohida va eng tor huquq.
  AI_READ: "ai.read",
  AI_ASSISTANT: "ai.assistant",
  AI_CONFIG: "ai.config",

  // Tizim: owner-only route'lar shu kalit orqali himoyalanadi.
  // requireRole(ROLES.OWNER) o'rniga requirePermission(SYSTEM_ADMIN_ACCESS).
  SYSTEM_ADMIN_ACCESS: "system.admin_access",

  // Rol va ruxsatlarni boshqarish (custom role UI)
  ROLES_READ: "roles.read",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
});

// Human-readable labels (used by the seed)
export const PERMISSION_LABELS = {
  [PERMISSIONS.USERS_READ]: { label: "Foydalanuvchilarni ko'rish", group: "users" },
  [PERMISSIONS.ARCHIVE_REASONS_MANAGE]: {
    label: "Arxiv sabablarini boshqarish",
    group: "users",
  },
  [PERMISSIONS.LEADS_READ]: { label: "Lidlarni ko'rish", group: "leads" },
  [PERMISSIONS.LEADS_MANAGE]: { label: "Lidlarni boshqarish", group: "leads" },

  [PERMISSIONS.STUDENTS_READ]: { label: "O'quvchilarni ko'rish", group: "students" },
  [PERMISSIONS.STUDENTS_CREATE]: { label: "O'quvchilarni yaratish", group: "students" },
  [PERMISSIONS.STUDENTS_UPDATE]: { label: "O'quvchilarni tahrirlash", group: "students" },
  [PERMISSIONS.STUDENTS_DELETE]: { label: "O'quvchilarni o'chirish", group: "students" },

  [PERMISSIONS.TEACHERS_READ]: { label: "O'qituvchilarni ko'rish", group: "teachers" },
  [PERMISSIONS.TEACHERS_CREATE]: { label: "O'qituvchilarni yaratish", group: "teachers" },
  [PERMISSIONS.TEACHERS_UPDATE]: { label: "O'qituvchilarni tahrirlash", group: "teachers" },
  [PERMISSIONS.TEACHERS_DELETE]: { label: "O'qituvchilarni o'chirish", group: "teachers" },

  [PERMISSIONS.CLASSES_READ]: { label: "Sinflarni ko'rish", group: "classes" },
  [PERMISSIONS.CLASSES_CREATE]: { label: "Sinflarni yaratish", group: "classes" },
  [PERMISSIONS.CLASSES_UPDATE]: { label: "Sinflarni tahrirlash", group: "classes" },
  [PERMISSIONS.CLASSES_DELETE]: { label: "Sinflarni o'chirish", group: "classes" },

  [PERMISSIONS.GROUPS_READ]: { label: "Guruhlarni ko'rish", group: "groups" },
  [PERMISSIONS.GROUPS_CREATE]: { label: "Guruhlarni yaratish", group: "groups" },
  [PERMISSIONS.GROUPS_UPDATE]: { label: "Guruhlarni tahrirlash", group: "groups" },
  [PERMISSIONS.GROUPS_DELETE]: { label: "Guruhlarni o'chirish", group: "groups" },
  [PERMISSIONS.GROUPS_MANAGE_STUDENTS]: {
    label: "Guruh o'quvchilarini boshqarish",
    group: "groups",
  },

  [PERMISSIONS.ATTENDANCE_READ]: { label: "Davomatni ko'rish", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_RECORD]: { label: "Davomatni belgilash", group: "attendance" },
  [PERMISSIONS.ATTENDANCE_MANAGE]: { label: "Davomatni boshqarish", group: "attendance" },

  [PERMISSIONS.GRADES_READ]: { label: "Baholarni ko'rish", group: "grades" },
  [PERMISSIONS.GRADES_RECORD]: { label: "Baho qo'yish", group: "grades" },
  [PERMISSIONS.GRADES_MANAGE]: { label: "Baholashni boshqarish", group: "grades" },
  [PERMISSIONS.RATING_READ]: { label: "Reytingni ko'rish", group: "rating" },
  [PERMISSIONS.RATING_MANAGE]: { label: "Reyting sozlamalarini boshqarish", group: "rating" },

  [PERMISSIONS.NOTIFICATIONS_READ]: {
    label: "Bildirishnomalarni ko'rish",
    group: "notifications",
  },
  [PERMISSIONS.NOTIFICATIONS_SEND]: {
    label: "Bildirishnoma yuborish",
    group: "notifications",
  },
  [PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE]: {
    label: "Bildirishnoma shablonlarini boshqarish",
    group: "notifications",
  },
  [PERMISSIONS.HOLIDAYS_MANAGE]: {
    label: "Bayramlarni boshqarish",
    group: "holidays",
  },
  [PERMISSIONS.FEEDBACK_READ]: {
    label: "Feedback'larni ko'rish",
    group: "feedback",
  },
  [PERMISSIONS.FEEDBACK_RESPOND]: {
    label: "Feedback'ga javob berish",
    group: "feedback",
  },
  [PERMISSIONS.FEEDBACK_TYPES_MANAGE]: {
    label: "Feedback turlarini boshqarish",
    group: "feedback",
  },

  [PERMISSIONS.ADMIN_DASHBOARD_READ]: {
    label: "Boshqaruv panelini ko'rish",
    group: "admin",
  },
  [PERMISSIONS.ACTIVITY_LOGS_READ]: {
    label: "Faoliyat loglarini ko'rish",
    group: "audit",
  },

  [PERMISSIONS.FINANCE_READ]: { label: "Moliyani ko'rish", group: "finance" },
  [PERMISSIONS.FINANCE_PAY]: { label: "To'lov qabul qilish", group: "finance" },
  [PERMISSIONS.FINANCE_MANAGE]: { label: "Moliyani boshqarish", group: "finance" },

  [PERMISSIONS.SALARY_READ]: { label: "Maoshlarni ko'rish", group: "finance" },
  [PERMISSIONS.SALARY_PAY]: { label: "Maosh to'lash", group: "finance" },
  [PERMISSIONS.FINANCE_APPROVE]: {
    label: "Chiqimni tasdiqlash",
    group: "finance",
  },
  [PERMISSIONS.APPROVALS_DECIDE_CONFIG]: {
    label: "Sozlama o'zgarishini tasdiqlash",
    group: "approvals",
  },

  [PERMISSIONS.BRANCHES_READ]: { label: "Filiallarni ko'rish", group: "branches" },
  [PERMISSIONS.BRANCHES_CREATE]: { label: "Filial yaratish", group: "branches" },
  [PERMISSIONS.BRANCHES_UPDATE]: { label: "Filialni tahrirlash", group: "branches" },
  [PERMISSIONS.BRANCHES_DELETE]: { label: "Filialni o'chirish", group: "branches" },
  [PERMISSIONS.BRANCHES_VIEW_ALL]: {
    label: "Barcha filiallarni ko'rish",
    group: "branches",
  },

  [PERMISSIONS.COURSES_READ]: { label: "Kurslarni ko'rish", group: "courses" },
  [PERMISSIONS.COURSES_MANAGE]: { label: "Kurslarni boshqarish", group: "courses" },

  [PERMISSIONS.AI_READ]: { label: "AI tahlilini ko'rish", group: "ai" },
  [PERMISSIONS.AI_ASSISTANT]: { label: "AI assistentdan foydalanish", group: "ai" },
  [PERMISSIONS.AI_CONFIG]: { label: "AI sozlamalarini boshqarish", group: "ai" },

  [PERMISSIONS.SYSTEM_ADMIN_ACCESS]: {
    label: "Tizim sozlamalariga kirish",
    group: "admin",
  },
  [PERMISSIONS.ROLES_READ]: { label: "Rollarni ko'rish", group: "admin" },
  [PERMISSIONS.ROLES_CREATE]: { label: "Rol yaratish", group: "admin" },
  [PERMISSIONS.ROLES_UPDATE]: { label: "Rolni tahrirlash", group: "admin" },
  [PERMISSIONS.ROLES_DELETE]: { label: "Rolni o'chirish", group: "admin" },
};

// --- Matritsa metadata ---
// UI jadvali: qator = module, ustun = action. Ikkalasi ham permission
// key'idan ("<module>.<action>") chiqadi, bu yerda faqat KO'RINISHI
// (nomi va tartibi) belgilanadi. Yangi permission qo'shilsa jadvalga
// avtomatik tushadi - fallback nomi key'ning o'zidan olinadi.

// Ustunlar tartibi. Rasmda: Create / Read / Update / Delete, keyin
// modulga xos nostandart action'lar (manage, record, pay...).
export const ACTION_ORDER = [
  "create",
  "read",
  "update",
  "delete",
  "manage",
  "record",
  "pay",
  "send",
  "respond",
  "manage_students",
  "view_all",
  "approve",
  "decide_config",
  "assistant",
  "config",
  "admin_access",
];

export const ACTION_LABELS = {
  create: "Yaratish",
  read: "Ko'rish",
  update: "Tahrirlash",
  delete: "O'chirish",
  manage: "Boshqarish",
  record: "Belgilash",
  pay: "To'lov",
  send: "Yuborish",
  respond: "Javob berish",
  manage_students: "O'quvchilarni biriktirish",
  view_all: "Barchasini ko'rish",
  approve: "Tasdiqlash",
  decide_config: "Sozlamani tasdiqlash",
  assistant: "Assistentdan foydalanish",
  config: "Sozlamalarni boshqarish",
  admin_access: "To'liq kirish",
};

// Qatorlar: ko'rinadigan nom + tartib.
export const MODULE_META = {
  admin_dashboard: { label: "Boshqaruv paneli", order: 10 },
  branches: { label: "Filiallar", order: 15 },
  users: { label: "Foydalanuvchilar", order: 20 },
  roles: { label: "Rollar va ruxsatlar", order: 30 },
  students: { label: "O'quvchilar", order: 40 },
  teachers: { label: "O'qituvchilar", order: 50 },
  groups: { label: "Guruhlar", order: 60 },
  courses: { label: "Kurslar", order: 65 },
  classes: { label: "Sinflar", order: 70 },
  leads: { label: "Lidlar", order: 80 },
  attendance: { label: "Davomat", order: 90 },
  grades: { label: "Baholash", order: 100 },
  rating: { label: "Reyting", order: 110 },
  finance: { label: "Moliya", order: 120 },
  salary: { label: "Maoshlar", order: 130 },
  approvals: { label: "Tasdiqlar", order: 135 },
  notifications: { label: "Bildirishnomalar", order: 140 },
  notification_templates: { label: "Bildirishnoma shablonlari", order: 150 },
  holidays: { label: "Bayramlar", order: 160 },
  feedback: { label: "Feedback", order: 170 },
  feedback_types: { label: "Feedback turlari", order: 180 },
  archive_reasons: { label: "Arxiv sabablari", order: 190 },
  activity_logs: { label: "Faoliyat loglari", order: 200 },
  ai: { label: "AI maslahatchi", order: 205 },
  system: { label: "Tizim", order: 210 },
};

// "users.read" -> { module: "users", action: "read" }
export const splitPermissionKey = (key) => {
  const idx = String(key).indexOf(".");
  if (idx === -1) return { module: String(key), action: "read" };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
};

export const getModuleMeta = (module) =>
  MODULE_META[module] || { label: module, order: 999 };

export const getActionLabel = (action) => ACTION_LABELS[action] || action;

export const getActionOrder = (action) => {
  const idx = ACTION_ORDER.indexOf(action);
  return idx === -1 ? ACTION_ORDER.length : idx;
};
