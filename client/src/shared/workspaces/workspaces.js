import { ROLE_TYPES } from "@/shared/constants/roles";
import { PERMISSIONS } from "@/shared/constants/permissions";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TO'RTTA ISH MAKONI (workspace)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Har biri BOSHQA SAVOLGA javob beradi:
 *
 *   SUPER_ADMIN  "Butun biznesni boshqaraman"
 *   ADMIN        "O'z filialimni boshqaraman"
 *   STAFF        "O'z ishimni bajaraman"
 *   STUDENT      "O'z o'qishimni boshqaraman"
 *
 * ── NEGA ROL EMAS, ISH MAKONI ──
 *
 * Rollar DINAMIK: ega istalgan payt "Buxgalter", "Filial direktori",
 * "Resepshin" yaratadi. Menyu rol NOMIGA bog'lansa, har yangi rol
 * bo'sh ekran ko'rardi. Ish makoni esa ODAMNING VAZIFASIDAN kelib
 * chiqadi va u ruxsatlar + filial ko'lamidan HISOBLANADI.
 *
 * ── ENG MUHIM QOIDA ──
 *
 * ADMIN — bu "tugmalari kamaytirilgan SUPER_ADMIN" EMAS.
 * Ular BOSHQA AXBOROT ARXITEKTURASIGA ega:
 *
 *   SUPER_ADMIN ning birinchi savoli: "qaysi FILIAL?"
 *   ADMIN ning birinchi savoli:       "bugun nima qilish kerak?"
 *
 * Shuning uchun SUPER_ADMIN navigatsiyasi filial/tashkilot o'lchovida
 * (Filiallar, Odamlar, Moliya, Tahlil), ADMIN niki esa kundalik ish
 * o'lchovida (O'quvchilar, Guruhlar, Davomat, Undirish).
 *
 * ── XAVFSIZLIK ──
 *
 * Bu fayl FAQAT UX. Hech qanday himoya bermaydi va bermasligi ham
 * kerak: server har so'rovda rol + ruxsat + filial ko'lamini o'zi
 * tekshiradi (server/src/middleware/auth.js). Bu yerdagi hisob
 * noto'g'ri bo'lsa ham foydalanuvchi ruxsatsiz ma'lumot OLMAYDI —
 * u faqat noto'g'ri menyu ko'radi.
 */
export const WORKSPACES = Object.freeze({
  SUPER_ADMIN: "superadmin",
  ADMIN: "admin",
  STAFF: "staff",
  STUDENT: "student",
});

export const WORKSPACE_META = Object.freeze({
  [WORKSPACES.SUPER_ADMIN]: {
    key: WORKSPACES.SUPER_ADMIN,
    label: "Tashkilot",
    tagline: "Butun biznesni boshqarish",
    home: "/org",
    root: "/org",
  },
  [WORKSPACES.ADMIN]: {
    key: WORKSPACES.ADMIN,
    label: "Filial",
    tagline: "Filialni boshqarish",
    home: "/branch",
    root: "/branch",
  },
  [WORKSPACES.STAFF]: {
    key: WORKSPACES.STAFF,
    label: "Ish joyim",
    tagline: "Menga biriktirilgan ish",
    home: "/work",
    root: "/work",
  },
  [WORKSPACES.STUDENT]: {
    key: WORKSPACES.STUDENT,
    label: "Mening sahifam",
    tagline: "O'qishim va to'lovlarim",
    home: "/me",
    root: "/me",
  },
});

/**
 * TASHKILOT DARAJASIDAGI VAKOLAT.
 *
 * Ikkalasi HAM bo'lishi shart:
 *   • `branches.view_all`     — barcha filialni birdan ko'rish
 *   • `system.admin_access`   — tashkilot sozlamalari (filial ochish
 *                               shu kalit bilan qulflangan, qarang
 *                               server/src/modules/branches/branches.routes.js)
 *
 * NEGA IKKALASI: faqat `view_all` bo'lgan odam — bu KONSOLIDATSIYA
 * HISOBOTINI o'qiydigan buxgalter, tashkilot boshqaruvchisi emas.
 * Unga "Filial yaratish" tugmasini ko'rsatish yolg'on va'da bo'lardi:
 * server baribir 403 qaytaradi.
 */
const hasOrgAuthority = (has) =>
  has(PERMISSIONS.BRANCHES_VIEW_ALL) && has(PERMISSIONS.SYSTEM_ADMIN_ACCESS);

/**
 * FILIAL DARAJASIDAGI VAKOLAT.
 *
 * `admin_dashboard.read` — "boshqaruv panelini ko'rish". Bu kalit
 * kodbazada allaqachon aynan shu ma'noda ishlatiladi: u filialning
 * UMUMIY manzarasini (o'quvchilar, davomat, kunlik tushum) ochadi.
 * Resepshinda u YO'Q (u faqat lid bilan ishlaydi), direktorda BOR.
 *
 * Ya'ni yangi ruxsat kaliti O'YLAB TOPILMADI — mavjud kalitning
 * ma'nosi ish makoniga bog'landi.
 */
const hasBranchAuthority = (has) => has(PERMISSIONS.ADMIN_DASHBOARD_READ);

/**
 * Foydalanuvchining ish makonini aniqlaydi.
 *
 * @param {object} auth              useAuth() natijasi
 * @param {(key: string) => boolean} has  usePermissions().has
 */
export const resolveWorkspace = (auth = {}, has = () => false) => {
  const { role, roleType } = auth;
  const type = roleType || role;

  if (type === ROLE_TYPES.STUDENT) return WORKSPACES.STUDENT;
  // O'qituvchi — HAR DOIM xodim makoni. Unga qancha ruxsat berilsa ham
  // "o'z ishim" nuqtai nazari o'zgarmaydi: u dars beradi, filial
  // boshqarmaydi. Filialni boshqarish kerak bo'lsa, unga filialga xos
  // ROL beriladi (UserBranchAssignment.role) va u boshqa makonga tushadi.
  if (type === ROLE_TYPES.TEACHER) return WORKSPACES.STAFF;
  if (type === ROLE_TYPES.OWNER) return WORKSPACES.SUPER_ADMIN;

  if (hasOrgAuthority(has)) return WORKSPACES.SUPER_ADMIN;
  if (hasBranchAuthority(has)) return WORKSPACES.ADMIN;
  return WORKSPACES.STAFF;
};

/** Ish makonining bosh sahifasi. */
export const workspaceHome = (workspace) =>
  WORKSPACE_META[workspace]?.home || "/me";

export default WORKSPACES;
