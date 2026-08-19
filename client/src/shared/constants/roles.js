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

// ── LANDING SAHIFA ENDI BU YERDA EMAS ──
//
// Ilgari `ROLE_HOME` xaritasi va `resolveHomePath()` bor edi: bosh
// sahifa `Role.defaultPath` satridan, u bo'lmasa shu xaritadan
// olinardi.
//
// MUAMMO: `defaultPath` — rol yaratilganda BIR MARTA yozib qo'yiladigan
// qiymat, ruxsatlar esa keyin o'zgaradi. Egasi direktorga yangi vakolat
// bersa, u boshqa ish makoniga o'tishi kerak — lekin `defaultPath`
// eski holicha qolardi va odam har login'dan keyin noto'g'ri panelga
// tushardi. Xato jimgina edi: hech qanday xabar, hech qanday log.
//
// Endi bosh sahifa ISH MAKONIDAN keladi va u RUXSATLARDAN
// HISOBLANADI: `shared/workspaces/workspaces.js` → `resolveWorkspace`,
// `shared/hooks/useWorkspace.js` → `home`.
//
// Login, bot-auth, `GuestGuard`, `RoleGuard` va 404 sahifasi —
// hammasi o'sha yagona manbadan foydalanadi.
