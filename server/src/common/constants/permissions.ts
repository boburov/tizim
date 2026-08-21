// ═══════════════════════════════════════════════════════════════════════════
// AVTOMATIK KO'CHIRILGAN — `server/src/constants/{permissions,roles}.js` dan.
//
// Qo'lda ko'chirilmadi: 87 ta kalitni qo'lda ko'chirish bitta harf xatosi
// bilan ruxsatni JIMGINA yo'q qilardi (kalit mos kelmasa `hasPermission`
// hech qachon `true` bermaydi va hech qanday xato ham chiqmaydi).
//
// Ular Express manbasi bilan AYNAN bir xilligini
// `test/constants-parity.test.mjs` har yurishda tekshiradi — ya'ni
// ikkala tomon ajralib ketsa test darhol yiqiladi.
//
// Faza 2 tugab, Express olib tashlangach bu fayl YAGONA manbaga aylanadi.
// ═══════════════════════════════════════════════════════════════════════════

export const PERMISSIONS = Object.freeze({
  "USERS_READ": "users.read",
  "USERS_CREATE": "users.create",
  "USERS_UPDATE": "users.update",
  "USERS_ARCHIVE": "users.archive",
  "USERS_PASSWORD": "users.password",
  "ARCHIVE_REASONS_MANAGE": "archive_reasons.manage",
  "LEADS_READ": "leads.read",
  "LEADS_CREATE": "leads.create",
  "LEADS_UPDATE": "leads.update",
  "LEADS_MANAGE": "leads.manage",
  "STUDENTS_READ": "students.read",
  "STUDENTS_CREATE": "students.create",
  "STUDENTS_UPDATE": "students.update",
  "STUDENTS_DELETE": "students.delete",
  "STUDENTS_FREEZE": "students.freeze",
  "TEACHERS_READ": "teachers.read",
  "TEACHERS_CREATE": "teachers.create",
  "TEACHERS_UPDATE": "teachers.update",
  "TEACHERS_DELETE": "teachers.delete",
  "CLASSES_READ": "classes.read",
  "CLASSES_CREATE": "classes.create",
  "CLASSES_UPDATE": "classes.update",
  "CLASSES_DELETE": "classes.delete",
  "GROUPS_READ": "groups.read",
  "GROUPS_CREATE": "groups.create",
  "GROUPS_UPDATE": "groups.update",
  "GROUPS_DELETE": "groups.delete",
  "GROUPS_MANAGE_STUDENTS": "groups.manage_students",
  "ATTENDANCE_READ": "attendance.read",
  "ATTENDANCE_RECORD": "attendance.record",
  "ATTENDANCE_MANAGE": "attendance.manage",
  "GRADES_READ": "grades.read",
  "GRADES_RECORD": "grades.record",
  "GRADES_MANAGE": "grades.manage",
  "RATING_READ": "rating.read",
  "RATING_MANAGE": "rating.manage",
  "NOTIFICATIONS_READ": "notifications.read",
  "NOTIFICATIONS_SEND": "notifications.send",
  "NOTIFICATION_TEMPLATES_MANAGE": "notification_templates.manage",
  "HOLIDAYS_MANAGE": "holidays.manage",
  "FEEDBACK_READ": "feedback.read",
  "FEEDBACK_RESPOND": "feedback.respond",
  "FEEDBACK_TYPES_MANAGE": "feedback_types.manage",
  "ASSIGNMENTS_READ": "assignments.read",
  "ASSIGNMENTS_SEND": "assignments.send",
  "STORAGE_MANAGE": "storage.manage",
  "ADMIN_DASHBOARD_READ": "admin_dashboard.read",
  "ACTIVITY_LOGS_READ": "activity_logs.read",
  "FINANCE_READ": "finance.read",
  "FINANCE_PAY": "finance.pay",
  "FINANCE_MANAGE": "finance.manage",
  "FINANCE_OPENING_BALANCE": "finance.opening_balance",
  "SALARY_READ": "salary.read",
  "SALARY_PAY": "salary.pay",
  "PAYROLL_READ": "payroll.read",
  "PAYROLL_MANAGE": "payroll.manage",
  "PAYROLL_PAY": "payroll.pay",
  "EXPENSES_READ": "expenses.read",
  "EXPENSES_CREATE": "expenses.create",
  "EXPENSES_MANAGE": "expenses.manage",
  "FINANCE_CREATE_EXPENSE": "finance.create_expense",
  "FINANCE_MANAGE_EXPENSE": "finance.manage_expense",
  "FINANCE_MANAGE_ACCOUNTS": "finance.manage_accounts",
  "FINANCE_MANAGE_REFUNDS": "finance.manage_refunds",
  "FINANCE_MANAGE_TRANSFERS": "finance.manage_transfers",
  "FINANCE_VIEW_PROFITABILITY": "finance.view_profitability",
  "FINANCE_VIEW_CASHFLOW": "finance.view_cashflow",
  "FINANCE_VIEW_RECEIVABLES": "finance.view_receivables",
  "FINANCE_MANAGE_OWNER_CAPITAL": "finance.manage_owner_capital",
  "FINANCE_MANAGE_BUDGETS": "finance.manage_budgets",
  "FINANCE_APPROVE": "finance.approve",
  "APPROVALS_DECIDE_CONFIG": "approvals.decide_config",
  "BRANCHES_READ": "branches.read",
  "BRANCHES_CREATE": "branches.create",
  "BRANCHES_UPDATE": "branches.update",
  "BRANCHES_DELETE": "branches.delete",
  "BRANCHES_VIEW_ALL": "branches.view_all",
  "COURSES_READ": "courses.read",
  "COURSES_MANAGE": "courses.manage",
  "AI_READ": "ai.read",
  "AI_ASSISTANT": "ai.assistant",
  "AI_CONFIG": "ai.config",
  "SYSTEM_ADMIN_ACCESS": "system.admin_access",
  "ROLES_READ": "roles.read",
  "ROLES_CREATE": "roles.create",
  "ROLES_UPDATE": "roles.update",
  "ROLES_DELETE": "roles.delete"
} as const);

export const ROLES = Object.freeze({
  "OWNER": "owner",
  "TEACHER": "teacher",
  "STUDENT": "student"
} as const);

export const ROLE_TYPES = Object.freeze({
  "OWNER": "owner",
  "STAFF": "staff",
  "TEACHER": "teacher",
  "STUDENT": "student"
} as const);

export const SYSTEM_ROLE_META = Object.freeze({
  "owner": {
    "roleType": "owner",
    "defaultPath": "/admin"
  },
  "teacher": {
    "roleType": "teacher",
    "defaultPath": "/teacher"
  },
  "student": {
    "roleType": "student",
    "defaultPath": "/student"
  }
} as const);

export const DEFAULT_ROLE_PATH = "/owner";

export const ALL_ROLES = Object.values(ROLES);
export const ALL_ROLE_TYPES = Object.values(ROLE_TYPES);

/**
 * `"owner" | "staff" | "teacher" | "student"` — Prisma'dagi `RoleType`
 * enumi bilan AYNAN bir xil to'plam. Alohida yozilmaydi: `ROLE_TYPES`
 * dan KELTIRIB CHIQARILADI, ya'ni ikkalasi ajralib keta olmaydi.
 */
export type RoleTypeValue = (typeof ROLE_TYPES)[keyof typeof ROLE_TYPES];
export const isSystemRoleValue = (value: string): boolean =>
  (ALL_ROLES as string[]).includes(value);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RUXSAT YORLIQLARI — `server_legacy/src/constants/permissions.js` dan
 * AVTOMATIK ko'chirilgan (yuqoridagi `PERMISSIONS` bilan bir xil usulda).
 *
 * BULARNI FAQAT SEED ISHLATADI. Ish vaqtida yorliqlar BAZADAN o'qiladi:
 * `roles.service.ts` ruxsat matritsasini qurayotganda `Permission.label`
 * va `Permission.moduleLabel` ustunlariga qaraydi. Ya'ni bu yerdagi matn
 * bazaga FAQAT seed orqali tushadi — seed yurmasa matritsa bo'sh qoladi.
 * Aynan shu sabab ko'chirish paytida bu blok tushib qolgan edi: hech bir
 * ish vaqti kodi unga murojaat qilmaydi.
 *
 * `test/constants-parity.test.mjs` uni Express manbasi bilan solishtiradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export interface PermissionLabel {
  label: string;
  group: string;
}

export const PERMISSION_LABELS: Readonly<Record<string, PermissionLabel>> = Object.freeze({
  "users.read": { label: "Foydalanuvchilarni ko'rish", group: "users" },
  "users.create": { label: "Foydalanuvchi yaratish", group: "users" },
  "users.update": { label: "Foydalanuvchini tahrirlash", group: "users" },
  "users.archive": { label: "Foydalanuvchini arxivlash va tiklash", group: "users" },
  "users.password": { label: "Parolni ko'rish va almashtirish", group: "users" },
  "archive_reasons.manage": { label: "Arxiv sabablarini boshqarish", group: "users" },
  "leads.read": { label: "Lidlarni ko'rish", group: "leads" },
  "leads.create": { label: "Lid qo'shish", group: "leads" },
  "leads.update": { label: "Lidni tahrirlash va status o'zgartirish", group: "leads" },
  "leads.manage": { label: "Lidlarni to'liq boshqarish (aylantirish, o'chirish)", group: "leads" },
  "students.read": { label: "O'quvchilarni ko'rish", group: "students" },
  "students.create": { label: "O'quvchilarni yaratish", group: "students" },
  "students.update": { label: "O'quvchilarni tahrirlash", group: "students" },
  "students.delete": { label: "O'quvchilarni o'chirish", group: "students" },
  "students.freeze": { label: "O'quvchini muzlatish", group: "students" },
  "teachers.read": { label: "O'qituvchilarni ko'rish", group: "teachers" },
  "teachers.create": { label: "O'qituvchilarni yaratish", group: "teachers" },
  "teachers.update": { label: "O'qituvchilarni tahrirlash", group: "teachers" },
  "teachers.delete": { label: "O'qituvchilarni o'chirish", group: "teachers" },
  "classes.read": { label: "Sinflarni ko'rish", group: "classes" },
  "classes.create": { label: "Sinflarni yaratish", group: "classes" },
  "classes.update": { label: "Sinflarni tahrirlash", group: "classes" },
  "classes.delete": { label: "Sinflarni o'chirish", group: "classes" },
  "groups.read": { label: "Guruhlarni ko'rish", group: "groups" },
  "groups.create": { label: "Guruhlarni yaratish", group: "groups" },
  "groups.update": { label: "Guruhlarni tahrirlash", group: "groups" },
  "groups.delete": { label: "Guruhlarni o'chirish", group: "groups" },
  "groups.manage_students": { label: "Guruh o'quvchilarini boshqarish", group: "groups" },
  "attendance.read": { label: "Davomatni ko'rish", group: "attendance" },
  "attendance.record": { label: "Davomatni belgilash", group: "attendance" },
  "attendance.manage": { label: "Davomatni boshqarish", group: "attendance" },
  "grades.read": { label: "Baholarni ko'rish", group: "grades" },
  "grades.record": { label: "Baho qo'yish", group: "grades" },
  "grades.manage": { label: "Baholashni boshqarish", group: "grades" },
  "rating.read": { label: "Reytingni ko'rish", group: "rating" },
  "rating.manage": { label: "Reyting sozlamalarini boshqarish", group: "rating" },
  "notifications.read": { label: "Bildirishnomalarni ko'rish", group: "notifications" },
  "notifications.send": { label: "Bildirishnoma yuborish", group: "notifications" },
  "notification_templates.manage": { label: "Bildirishnoma shablonlarini boshqarish", group: "notifications" },
  "holidays.manage": { label: "Bayramlarni boshqarish", group: "holidays" },
  "feedback.read": { label: "Feedback'larni ko'rish", group: "feedback" },
  "feedback.respond": { label: "Feedback'ga javob berish", group: "feedback" },
  "feedback_types.manage": { label: "Feedback turlarini boshqarish", group: "feedback" },
  "assignments.read": { label: "Vazifalarni ko'rish", group: "assignments" },
  "assignments.send": { label: "Vazifa yuborish", group: "assignments" },
  "storage.manage": { label: "Fayl saqlagichni boshqarish", group: "storage" },
  "admin_dashboard.read": { label: "Boshqaruv panelini ko'rish", group: "admin" },
  "activity_logs.read": { label: "Faoliyat loglarini ko'rish", group: "audit" },
  "finance.read": { label: "Moliyani ko'rish", group: "finance" },
  "finance.pay": { label: "To'lov qabul qilish", group: "finance" },
  "finance.manage": { label: "Moliyani boshqarish", group: "finance" },
  "finance.opening_balance": { label: "Boshlang'ich qoldiq kiritish", group: "finance" },
  "salary.read": { label: "Maoshlarni ko'rish", group: "finance" },
  "salary.pay": { label: "Maosh to'lash", group: "finance" },
  "payroll.read": { label: "Xodimlar maoshini ko'rish", group: "finance" },
  "payroll.manage": { label: "KPI qoidalari va maosh shartnomalari", group: "finance" },
  "payroll.pay": { label: "Xodimga maosh to'lash", group: "finance" },
  "expenses.read": { label: "Chiqimlarni ko'rish", group: "finance" },
  "expenses.create": { label: "Chiqim qo'shish", group: "finance" },
  "expenses.manage": { label: "Chiqim kategoriyalari va o'chirish", group: "finance" },
  "finance.create_expense": { label: "Chiqim yozish", group: "finance" },
  "finance.manage_expense": { label: "Chiqimni boshqarish (kategoriya, o'chirish)", group: "finance" },
  "finance.manage_accounts": { label: "Moliyaviy hisoblarni boshqarish", group: "finance" },
  "finance.manage_refunds": { label: "Qaytarimlarni boshqarish", group: "finance" },
  "finance.manage_transfers": { label: "O'tkazma va inkassatsiya", group: "finance" },
  "finance.view_profitability": { label: "Foydalilik tahlili (maosh tannarxini ko'rsatadi)", group: "finance" },
  "finance.view_cashflow": { label: "Pul oqimi va kassa qoldiqlari", group: "finance" },
  "finance.view_receivables": { label: "Qarzdorlik va undirish tahlili", group: "finance" },
  "finance.manage_owner_capital": { label: "Egasining puli (kiritish / yechib olish)", group: "finance" },
  "finance.manage_budgets": { label: "Byudjetni boshqarish", group: "finance" },
  "finance.approve": { label: "Chiqimni tasdiqlash", group: "finance" },
  "approvals.decide_config": { label: "Sozlama o'zgarishini tasdiqlash", group: "approvals" },
  "branches.read": { label: "Filiallarni ko'rish", group: "branches" },
  "branches.create": { label: "Filial yaratish", group: "branches" },
  "branches.update": { label: "Filialni tahrirlash", group: "branches" },
  "branches.delete": { label: "Filialni o'chirish", group: "branches" },
  "branches.view_all": { label: "Barcha filiallarni ko'rish", group: "branches" },
  "courses.read": { label: "Kurslarni ko'rish", group: "courses" },
  "courses.manage": { label: "Kurslarni boshqarish", group: "courses" },
  "ai.read": { label: "AI tahlilini ko'rish", group: "ai" },
  "ai.assistant": { label: "AI assistentdan foydalanish", group: "ai" },
  "ai.config": { label: "AI sozlamalarini boshqarish", group: "ai" },
  "system.admin_access": { label: "Tizim sozlamalariga kirish", group: "admin" },
  "roles.read": { label: "Rollarni ko'rish", group: "admin" },
  "roles.create": { label: "Rol yaratish", group: "admin" },
  "roles.update": { label: "Rolni tahrirlash", group: "admin" },
  "roles.delete": { label: "Rolni o'chirish", group: "admin" },
});

// ═══════════════════════════════════════════════════════════════════════════
// MATRITSA METADATA — `server/src/constants/permissions.js` dan ko'chirilgan.
//
// UI jadvali: qator = module, ustun = action. Ikkalasi ham ruxsat
// kalitidan (`"<module>.<action>"`) chiqadi; bu yerda faqat KO'RINISHI
// (nomi va tartibi) belgilanadi. Yangi ruxsat qo'shilsa jadvalga
// avtomatik tushadi — zaxira nomi kalitning o'zidan olinadi.
//
// `test/constants-parity.test.mjs` bularni ham Express manbasi bilan
// solishtiradi.
// ═══════════════════════════════════════════════════════════════════════════

export const ACTION_ORDER: string[] = [
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
  "admin_access"
];

export const ACTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "create": "Yaratish",
  "read": "Ko'rish",
  "update": "Tahrirlash",
  "delete": "O'chirish",
  "manage": "Boshqarish",
  "record": "Belgilash",
  "pay": "To'lov",
  "send": "Yuborish",
  "respond": "Javob berish",
  "manage_students": "O'quvchilarni biriktirish",
  "view_all": "Barchasini ko'rish",
  "approve": "Tasdiqlash",
  "decide_config": "Sozlamani tasdiqlash",
  "assistant": "Assistentdan foydalanish",
  "config": "Sozlamalarni boshqarish",
  "admin_access": "To'liq kirish"
});

export interface ModuleMeta {
  label: string;
  order: number;
}

export const MODULE_META: Readonly<Record<string, ModuleMeta>> = Object.freeze({
  "admin_dashboard": {
    "label": "Boshqaruv paneli",
    "order": 10
  },
  "branches": {
    "label": "Filiallar",
    "order": 15
  },
  "users": {
    "label": "Foydalanuvchilar",
    "order": 20
  },
  "roles": {
    "label": "Rollar va ruxsatlar",
    "order": 30
  },
  "students": {
    "label": "O'quvchilar",
    "order": 40
  },
  "teachers": {
    "label": "O'qituvchilar",
    "order": 50
  },
  "groups": {
    "label": "Guruhlar",
    "order": 60
  },
  "courses": {
    "label": "Kurslar",
    "order": 65
  },
  "classes": {
    "label": "Sinflar",
    "order": 70
  },
  "leads": {
    "label": "Lidlar",
    "order": 80
  },
  "attendance": {
    "label": "Davomat",
    "order": 90
  },
  "grades": {
    "label": "Baholash",
    "order": 100
  },
  "rating": {
    "label": "Reyting",
    "order": 110
  },
  "finance": {
    "label": "Moliya",
    "order": 120
  },
  "salary": {
    "label": "Maoshlar",
    "order": 130
  },
  "approvals": {
    "label": "Tasdiqlar",
    "order": 135
  },
  "assignments": {
    "label": "Vazifalar",
    "order": 138
  },
  "storage": {
    "label": "Fayl saqlagich",
    "order": 139
  },
  "notifications": {
    "label": "Bildirishnomalar",
    "order": 140
  },
  "notification_templates": {
    "label": "Bildirishnoma shablonlari",
    "order": 150
  },
  "holidays": {
    "label": "Bayramlar",
    "order": 160
  },
  "feedback": {
    "label": "Feedback",
    "order": 170
  },
  "feedback_types": {
    "label": "Feedback turlari",
    "order": 180
  },
  "archive_reasons": {
    "label": "Arxiv sabablari",
    "order": 190
  },
  "activity_logs": {
    "label": "Faoliyat loglari",
    "order": 200
  },
  "ai": {
    "label": "AI maslahatchi",
    "order": 205
  },
  "system": {
    "label": "Tizim",
    "order": 210
  }
});

/** `"users.read"` → `{ module: "users", action: "read" }` */
export const splitPermissionKey = (key: string): { module: string; action: string } => {
  const idx = String(key).indexOf('.');
  if (idx === -1) return { module: String(key), action: 'read' };
  return { module: key.slice(0, idx), action: key.slice(idx + 1) };
};

export const getModuleMeta = (module: string): ModuleMeta =>
  MODULE_META[module] || { label: module, order: 999 };

export const getActionLabel = (action: string): string =>
  ACTION_LABELS[action] || action;

export const getActionOrder = (action: string): number => {
  const idx = ACTION_ORDER.indexOf(action);
  return idx === -1 ? ACTION_ORDER.length : idx;
};

/**
 * O'QITUVCHI DAVOMATI HOLATLARI.
 *
 * ⚠ `server/src/constants/teacherAttendance.js` DAN AYNAN KO'CHIRILGAN.
 *
 * "exempt" ATAYLAB YO'Q: o'quvchida "imtiyoz" tushunchasi bor
 * (`AttendanceExemption`), o'qituvchida esa yo'q — u yo keldi, yo
 * kelmadi, yo sababli kelmadi. Ro'yxatga "exempt" qo'shilsa maosh
 * hisobi uni qanday qarashini bilmasdi.
 *
 * Qiymatlar Prisma `TeacherAttendanceStatus` enumi bilan AYNAN bir xil
 * bo'lishi SHART — aks holda yozuv bazada rad etiladi.
 */
export const TEACHER_ATTENDANCE_STATUSES: string[] = [
  'present',
  'absent',
  'excused',
];
