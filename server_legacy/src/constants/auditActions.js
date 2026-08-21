// Audit log semantik qatlami: (method + path) -> o'zbekcha amal nomi va tavsifi.
//
// Nima uchun serverda? Loglar kelajakda CSV/PDF eksport va hisobotlarga tushadi -
// agar tarjima faqat React'da bo'lsa, ma'lumot brauzerdan chiqishi bilan
// ma'nosini yo'qotadi. Shuning uchun manba shu yerda.

// Ko'rsatiladigan amal turlari. Badge rangi klientda shu kalitlar bo'yicha tanlanadi.
export const AUDIT_ACTIONS = Object.freeze({
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  SYSTEM: "SYSTEM",
});

// Metod -> zaxira (fallback) amal turi
const METHOD_ACTION = {
  POST: AUDIT_ACTIONS.CREATE,
  PATCH: AUDIT_ACTIONS.UPDATE,
  PUT: AUDIT_ACTIONS.UPDATE,
  DELETE: AUDIT_ACTIONS.DELETE,
};

// Metod -> zaxira fe'l (aniq marshrut topilmaganda)
const METHOD_VERB = {
  POST: "qo'shildi",
  PATCH: "tahrirlandi",
  PUT: "yangilandi",
  DELETE: "o'chirildi",
};

// resourceType -> o'zbekcha modul nomi (zaxira tavsif va filtr uchun)
export const RESOURCE_LABELS = Object.freeze({
  user: "Foydalanuvchi",
  group: "Guruh",
  attendance: "Davomat",
  attendanceExemption: "Davomat imtiyozi",
  attendanceSettings: "Davomat sozlamalari",
  feedback: "Fikr-mulohaza",
  feedbackType: "Fikr-mulohaza turi",
  holiday: "Bayram",
  notification: "Bildirishnoma",
  notificationTemplate: "Bildirishnoma shabloni",
  auth: "Autentifikatsiya",
  botAuth: "Bot autentifikatsiyasi",
  activityLog: "Faoliyat logi",
  adminDashboard: "Boshqaruv paneli",
});

// Aniq marshrutlar registri. Kalit: "METHOD:/normallashtirilgan/yo'l"
// Yo'ldagi MongoDB ID'lari ":id" ga almashtiriladi, shuning uchun
// "/api/groups/64ab.../students" -> "/groups/:id/students" bo'lib mos keladi.
const ROUTE_REGISTRY = {
  // Auth
  "POST:/auth/login": { action: AUDIT_ACTIONS.LOGIN, label: "Tizimga kirdi" },
  "POST:/auth/logout": {
    action: AUDIT_ACTIONS.LOGOUT,
    label: "Tizimdan chiqdi",
  },
  "POST:/bot-auth/login": {
    action: AUDIT_ACTIONS.LOGIN,
    label: "Bot orqali tizimga kirdi",
  },

  // Foydalanuvchilar
  "POST:/users": { action: AUDIT_ACTIONS.CREATE, label: "Yangi foydalanuvchi qo'shildi" },
  "PATCH:/users/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Foydalanuvchi ma'lumotlari tahrirlandi",
  },
  "DELETE:/users/:id": {
    action: AUDIT_ACTIONS.DELETE,
    label: "Foydalanuvchi o'chirildi",
  },
  // XODIMLAR bo'limining amallari. Hammasi allaqachon auditLog middleware
  // orqali yozilyapti - bu yerda faqat o'zbekcha tavsifi qo'shiladi,
  // aks holda audit ekranida "Foydalanuvchi tahrirlandi" bo'lib ko'rinardi.
  "POST:/users/staff": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Yangi xodim qo'shildi",
  },
  "PATCH:/users/:id/role": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Xodim roli o'zgartirildi",
  },
  "PATCH:/users/:id/branches": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Xodim filiali o'zgartirildi",
  },
  "PATCH:/users/:id/password": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Foydalanuvchi paroli o'zgartirildi",
  },
  "POST:/users/:id/restore": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Foydalanuvchi arxivdan tiklandi",
  },

  // Guruhlar
  "POST:/groups": { action: AUDIT_ACTIONS.CREATE, label: "Yangi guruh ochildi" },
  "PATCH:/groups/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Guruh ma'lumotlari tahrirlandi",
  },
  "DELETE:/groups/:id": { action: AUDIT_ACTIONS.DELETE, label: "Guruh o'chirildi" },
  "POST:/groups/:id/students": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Guruhga talaba qo'shildi",
  },
  "DELETE:/groups/:id/students/:id": {
    action: AUDIT_ACTIONS.DELETE,
    label: "Talaba guruhdan chiqarildi",
  },
  "PATCH:/groups/:id/students/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Guruhdagi talaba ma'lumoti tahrirlandi",
  },

  // Davomat
  "POST:/attendance": { action: AUDIT_ACTIONS.CREATE, label: "Davomat belgilandi" },
  "PATCH:/attendance/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Davomat tahrirlandi",
  },
  "POST:/attendance-exemptions": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Davomat imtiyozi berildi",
  },
  "DELETE:/attendance-exemptions/:id": {
    action: AUDIT_ACTIONS.DELETE,
    label: "Davomat imtiyozi bekor qilindi",
  },
  "PATCH:/attendance-settings": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Davomat sozlamalari o'zgartirildi",
  },

  // Fikr-mulohaza
  "POST:/feedback": { action: AUDIT_ACTIONS.CREATE, label: "Yangi fikr-mulohaza qoldirildi" },
  "PATCH:/feedback/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Fikr-mulohaza tahrirlandi",
  },
  "DELETE:/feedback/:id": {
    action: AUDIT_ACTIONS.DELETE,
    label: "Fikr-mulohaza o'chirildi",
  },
  "POST:/feedback-types": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Fikr-mulohaza turi qo'shildi",
  },

  // Bildirishnomalar
  "POST:/notifications": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Bildirishnoma yuborildi",
  },
  "DELETE:/notifications/:id": {
    action: AUDIT_ACTIONS.DELETE,
    label: "Bildirishnoma o'chirildi",
  },
  "POST:/notification-templates": {
    action: AUDIT_ACTIONS.CREATE,
    label: "Bildirishnoma shabloni yaratildi",
  },
  "PATCH:/notification-templates/:id": {
    action: AUDIT_ACTIONS.UPDATE,
    label: "Bildirishnoma shabloni tahrirlandi",
  },

  // Bayramlar
  "POST:/holidays": { action: AUDIT_ACTIONS.CREATE, label: "Bayram kuni qo'shildi" },
  "PATCH:/holidays/:id": { action: AUDIT_ACTIONS.UPDATE, label: "Bayram kuni tahrirlandi" },
  "DELETE:/holidays/:id": { action: AUDIT_ACTIONS.DELETE, label: "Bayram kuni o'chirildi" },
};

const MONGO_ID_REGEX = /^[a-f0-9]{24}$/i;

// "/api/groups/64ab.../students?x=1" -> "/groups/:id/students"
export const normalizePath = (rawPath) => {
  if (!rawPath) return "";
  const parts = String(rawPath).split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "api") parts.shift();
  const normalized = parts.map((p) =>
    MONGO_ID_REGEX.test(p) || /^\d+$/.test(p) ? ":id" : p,
  );
  return `/${normalized.join("/")}`;
};

/**
 * Log yozuvidan ko'rsatish uchun amal turi va o'zbekcha tavsifni hosil qiladi.
 * Aniq marshrut topilmasa - resourceType + metod fe'li bo'yicha zaxira tavsif.
 */
export const describeLog = ({ method, path, resourceType, status } = {}) => {
  const key = `${method}:${normalizePath(path)}`;
  const hit = ROUTE_REGISTRY[key];

  const failed = typeof status === "number" && status >= 400;

  if (hit) {
    return { action: hit.action, description: hit.label, failed };
  }

  // Zaxira: "Guruh tahrirlandi"
  const action = METHOD_ACTION[method] || AUDIT_ACTIONS.SYSTEM;
  const raw = RESOURCE_LABELS[resourceType] || resourceType || "Element";
  // Tarjimasi yo'q resurs slug'i ("ai") bosh harf bilan boshlansin
  const resourceLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
  const verb = METHOD_VERB[method] || "amal bajarildi";

  return { action, description: `${resourceLabel} ${verb}`, failed };
};

export default ROUTE_REGISTRY;
