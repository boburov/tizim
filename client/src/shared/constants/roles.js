// Built-in role values (also stored as-is in the DB).
// DIQQAT: rollar DINAMIK - owner UI orqali custom rol yaratishi mumkin.
// Bu ro'yxat faqat tizim rollarini bildiradi, to'liq ro'yxat emas.
export const ROLES = Object.freeze({
  OWNER: "owner",
  TEACHER: "teacher",
  STUDENT: "student",
});

export const ROLE_LABELS = Object.freeze({
  owner: "Ega",
  teacher: "O'qituvchi",
  student: "O'quvchi",
});

export const ALL_ROLES = Object.values(ROLES);

// Rol "tipi" - custom rolning xatti-harakat shabloni (serverdagi ROLE_TYPES).
export const ROLE_TYPES = Object.freeze({
  OWNER: "owner",
  STAFF: "staff",
  TEACHER: "teacher",
  STUDENT: "student",
});

export const ROLE_TYPE_LABELS = Object.freeze({
  owner: "Ega (to'liq kirish)",
  staff: "Xodim",
  teacher: "O'qituvchi",
  student: "O'quvchi",
});

// Built-in rol uchun standart landing route. Custom rol uchun bu map'da
// yozuv YO'Q - u serverdan (roleMeta.defaultPath) keladi. Shuning uchun
// to'g'ridan-to'g'ri ROLE_HOME[role] o'rniga resolveHomePath() ishlating.
export const ROLE_HOME = Object.freeze({
  // EGA -> RAHBARIYAT QOBIG'I. Server ham shu qiymatni beradi
  // (`Role.defaultPath`), bu yerdagi map faqat ZAXIRA: server javobi
  // hali kelmagan yoki rol bazada topilmagan holat uchun.
  //
  // `RoleGuard` da `/admin` uchun ALOHIDA istisno bor - u rol emas,
  // owner panelining ikkinchi qarashi (qarang admin/index.js).
  owner: "/admin",
  teacher: "/teacher",
  student: "/student",
});

// Custom rol standart ravishda owner paneliga tushadi (staff rollari
// asosan boshqaruv paneli bilan ishlaydi).
export const FALLBACK_HOME = "/owner";

// Landing sahifani aniqlashning YAGONA joyi.
// Tartib: serverdagi rol sozlamasi -> built-in map -> rol tipi -> fallback.
export const resolveHomePath = ({ defaultPath, role, roleType } = {}) =>
  defaultPath || ROLE_HOME[role] || ROLE_HOME[roleType] || FALLBACK_HOME;
