// Tizim (built-in) rollari. Bular DB'dan HECH QACHON o'chirilmaydi va
// value'si o'zgarmaydi - kod bazasi shu qiymatlarga tayanadi.
export const ROLES = Object.freeze({
  OWNER: "owner",
  TEACHER: "teacher",
  STUDENT: "student",
});

export const ALL_ROLES = Object.values(ROLES);

// Rol "tipi" - custom rol uchun xatti-harakat shabloni.
// Servicelardagi ma'lumot ko'lami (scope) logikasi rol NOMIGA emas, shu
// tipga tayanadi: "Katta o'qituvchi" nomli custom rol roleType="teacher"
// bo'lsa, o'qituvchi scope'i bilan ishlaydi.
export const ROLE_TYPES = Object.freeze({
  OWNER: "owner",
  STAFF: "staff", // yangi custom rollar uchun standart tip (xodim)
  TEACHER: "teacher",
  STUDENT: "student",
});

export const ALL_ROLE_TYPES = Object.values(ROLE_TYPES);

// Built-in rolning tipi va standart landing sahifasi.
export const SYSTEM_ROLE_META = Object.freeze({
  [ROLES.OWNER]: { roleType: ROLE_TYPES.OWNER, defaultPath: "/owner" },
  [ROLES.TEACHER]: { roleType: ROLE_TYPES.TEACHER, defaultPath: "/teacher" },
  [ROLES.STUDENT]: { roleType: ROLE_TYPES.STUDENT, defaultPath: "/student" },
});

// Custom rol yaratilganda beriladigan standart landing sahifasi.
export const DEFAULT_ROLE_PATH = "/owner";

export const isSystemRoleValue = (value) => ALL_ROLES.includes(value);
