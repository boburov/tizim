// Permission keys (the seed writes the same keys to the DB)
export const PERMISSIONS = Object.freeze({
  USERS_READ: "users.read",

  // FOYDALANUVCHI USTIDAN AMALLAR (rolidan qat'i nazar).
  //
  // NEGA students.* / teachers.* dan ALOHIDA: bu route'lar GENERIK -
  // bitta endpoint o'quvchini ham, o'qituvchini ham, xodimni ham
  // tahrirlaydi (users.service.js dagi update/softRemove roliga qarab
  // maydonlarni ajratadi). Rolga bog'liq kalit ishlatilsa, "o'qituvchini
  // tahrirlay oladi, lekin resepshinni yo'q" degan holat kelib chiqardi.
  //
  // Ilgari bu uchtasi requireRole(OWNER) bilan qulflangan edi - ya'ni
  // filial direktori O'Z filialidagi xodimini ham tahrirlay olmasdi.
  // Endi ular ruxsatga ko'chirildi, filial himoyasi esa servis
  // qatlamidagi assertTargetInScope bilan ta'minlanadi.
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  // Arxivlash + tiklash (yumshoq o'chirish). Butunlay o'chirish
  // (/permanent) bu kalitga KIRMAYDI - u owner-only bo'lib qoladi.
  USERS_ARCHIVE: "users.archive",
  // Parolni ko'rish va almashtirish. Filial chegarasi ALOHIDA
  // himoyalangan: helpers/credentialScope.helper.js - `branches.view_all`
  // bu yerda o'tkazgich bo'lmaydi.
  USERS_PASSWORD: "users.password",

  ARCHIVE_REASONS_MANAGE: "archive_reasons.manage",

  // LIDLAR. Uch darajaga ATAYLAB ajratilgan - "resepshin" roli uchun.
  //
  // Resepshin telefonga javob beradi: lid yaratadi, ro'yxatni ko'radi va
  // status siljitadi. LEKIN u o'quvchiga aylantirishi (guruhga yozish -
  // moliyaviy majburiyat yaratadi) yoki lidni o'chirishi MUMKIN EMAS.
  //
  // Ilgari faqat leads.manage bor edi va u hammasini birdan berardi:
  // lid yaratish huquqi bergan odam avtomatik ravishda o'chirish va
  // guruhga qabul qilish huquqini ham olardi.
  LEADS_READ: "leads.read",
  LEADS_CREATE: "leads.create",
  // Tahrirlash + status o'zgartirish + eslatma qo'yish.
  LEADS_UPDATE: "leads.update",
  // ENG KUCHLI: o'quvchiga aylantirish, o'chirish, manba/sabab ro'yxatlarini
  // boshqarish. Orqaga moslik uchun u LEADS_CREATE/UPDATE ni ham QAMRAYDI -
  // qarang permission.helper.js: PERMISSION_IMPLIES.
  LEADS_MANAGE: "leads.manage",

  STUDENTS_READ: "students.read",
  STUDENTS_CREATE: "students.create",
  STUDENTS_UPDATE: "students.update",
  STUDENTS_DELETE: "students.delete",
  // MUZLATISH: o'quvchi vaqtincha to'xtaydi (to'lov hisoblanmaydi).
  // STUDENTS_DELETE dan ATAYLAB ajratilgan - o'quvchi ARXIVLANMAYDI
  // (users.service.js softRemove buni ochiq rad etadi), muzlatish esa
  // uning o'rnini bosadigan kundalik filial amali.
  STUDENTS_FREEZE: "students.freeze",

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

  // Vazifalar (matn + fayl, guruh o'quvchilariga bot orqali).
  // NOTIFICATIONS_SEND dan ATAYLAB ajratilgan: vazifa markazning DISKINI
  // yeydi. Xabar yuborish huquqi bor xodim avtomatik ravishda kvotani
  // to'ldirish huquqini OLMASLIGI kerak.
  ASSIGNMENTS_READ: "assignments.read",
  ASSIGNMENTS_SEND: "assignments.send",

  // Fayl saqlagichni BOSHQARISH: tozalash siyosati, qo'lda tozalash,
  // begona faylni o'chirish. ASSIGNMENTS_* dan ATAYLAB ajratilgan -
  // vazifa yuborish huquqi bor o'qituvchi butun markazning fayllarini
  // o'chirib yuborish huquqini OLMASLIGI kerak.
  STORAGE_MANAGE: "storage.manage",

  // Admin dashboard + audit (Bo'lak 9)
  ADMIN_DASHBOARD_READ: "admin_dashboard.read",
  ACTIVITY_LOGS_READ: "activity_logs.read",

  // Finance (Moliya)
  FINANCE_READ: "finance.read",
  FINANCE_PAY: "finance.pay",
  FINANCE_MANAGE: "finance.manage",
  // BOSHLANG'ICH QOLDIQ: tizimga o'tishdan oldingi qarz/haq.
  // FINANCE_MANAGE dan ATAYLAB ajratilgan - yozuv O'ZGARMAS (model
  // darajasida immutable + unique), ya'ni xato kiritilsa faqat
  // korreksiya tranzaksiyasi bilan tuzatiladi.
  FINANCE_OPENING_BALANCE: "finance.opening_balance",

  // Teacher salary (O'qituvchi maoshlari)
  SALARY_READ: "salary.read",
  SALARY_PAY: "salary.pay",

  // XODIMLAR MAOSHI (o'qituvchi bo'lmagan xodimlar + KPI).
  //
  // SALARY_* dan ATAYLAB ajratilgan: u allaqachon "faqat o'qituvchilarni
  // ko'rsin" deb berilgan odamlarda bor. Xodim maoshi esa boshqa
  // ma'lumot - direktor va resepshin oyligini ko'rish huquqi alohida
  // qaror bo'lishi kerak.
  PAYROLL_READ: "payroll.read",
  // KPI qoidalari va maosh shartnomalari - "shartlarni belgilash".
  PAYROLL_MANAGE: "payroll.manage",
  // Pul chiqishi - eng kuchli huquq, alohida.
  PAYROLL_PAY: "payroll.pay",

  // UMUMIY CHIQIMLAR (ijara, kommunal, ta'mir, reklama, jihoz, soliq).
  // SALARY_* dan ATAYLAB ajratilgan: maosh to'lash va ofis xarajatlarini
  // yozish odatda BOSHQA odamlarning ishi (kassir / xo'jalik mudiri).
  EXPENSES_READ: "expenses.read",
  EXPENSES_CREATE: "expenses.create",
  // Kategoriyalarni boshqarish va chiqimni O'CHIRISH - kuchliroq huquq.
  EXPENSES_MANAGE: "expenses.manage",

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
  [PERMISSIONS.USERS_CREATE]: {
    label: "Foydalanuvchi yaratish",
    group: "users",
  },
  [PERMISSIONS.USERS_UPDATE]: {
    label: "Foydalanuvchini tahrirlash",
    group: "users",
  },
  [PERMISSIONS.USERS_ARCHIVE]: {
    label: "Foydalanuvchini arxivlash va tiklash",
    group: "users",
  },
  [PERMISSIONS.USERS_PASSWORD]: {
    label: "Parolni ko'rish va almashtirish",
    group: "users",
  },
  [PERMISSIONS.ARCHIVE_REASONS_MANAGE]: {
    label: "Arxiv sabablarini boshqarish",
    group: "users",
  },
  [PERMISSIONS.LEADS_READ]: { label: "Lidlarni ko'rish", group: "leads" },
  [PERMISSIONS.LEADS_CREATE]: { label: "Lid qo'shish", group: "leads" },
  [PERMISSIONS.LEADS_UPDATE]: {
    label: "Lidni tahrirlash va status o'zgartirish",
    group: "leads",
  },
  [PERMISSIONS.LEADS_MANAGE]: {
    label: "Lidlarni to'liq boshqarish (aylantirish, o'chirish)",
    group: "leads",
  },

  [PERMISSIONS.STUDENTS_READ]: { label: "O'quvchilarni ko'rish", group: "students" },
  [PERMISSIONS.STUDENTS_CREATE]: { label: "O'quvchilarni yaratish", group: "students" },
  [PERMISSIONS.STUDENTS_UPDATE]: { label: "O'quvchilarni tahrirlash", group: "students" },
  [PERMISSIONS.STUDENTS_DELETE]: { label: "O'quvchilarni o'chirish", group: "students" },
  [PERMISSIONS.STUDENTS_FREEZE]: {
    label: "O'quvchini muzlatish",
    group: "students",
  },

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

  [PERMISSIONS.ASSIGNMENTS_READ]: {
    label: "Vazifalarni ko'rish",
    group: "assignments",
  },
  [PERMISSIONS.ASSIGNMENTS_SEND]: {
    label: "Vazifa yuborish",
    group: "assignments",
  },
  [PERMISSIONS.STORAGE_MANAGE]: {
    label: "Fayl saqlagichni boshqarish",
    group: "storage",
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
  [PERMISSIONS.FINANCE_OPENING_BALANCE]: {
    label: "Boshlang'ich qoldiq kiritish",
    group: "finance",
  },

  [PERMISSIONS.SALARY_READ]: { label: "Maoshlarni ko'rish", group: "finance" },
  [PERMISSIONS.SALARY_PAY]: { label: "Maosh to'lash", group: "finance" },
  [PERMISSIONS.PAYROLL_READ]: {
    label: "Xodimlar maoshini ko'rish",
    group: "finance",
  },
  [PERMISSIONS.PAYROLL_MANAGE]: {
    label: "KPI qoidalari va maosh shartnomalari",
    group: "finance",
  },
  [PERMISSIONS.PAYROLL_PAY]: {
    label: "Xodimga maosh to'lash",
    group: "finance",
  },
  [PERMISSIONS.EXPENSES_READ]: { label: "Chiqimlarni ko'rish", group: "finance" },
  [PERMISSIONS.EXPENSES_CREATE]: { label: "Chiqim qo'shish", group: "finance" },
  [PERMISSIONS.EXPENSES_MANAGE]: {
    label: "Chiqim kategoriyalari va o'chirish",
    group: "finance",
  },
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
  assignments: { label: "Vazifalar", order: 138 },
  storage: { label: "Fayl saqlagich", order: 139 },
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
