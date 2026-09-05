import { Navigate } from "react-router-dom";

import useAuth from "@/shared/hooks/useAuth";
import { ROLE_TYPES } from "@/shared/constants/roles";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ADMIN PANELI — EGA VA DIREKTORLAR UCHUN
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NIMANI TO'SADI ──
 * FAQAT o'quvchi va o'qituvchini: ularning to'liq o'z panellari bor
 * (`/me`, `/teacher`) va operatsion panel ularga hech qachon ochiq
 * emas edi.
 *
 * ══════════════════════════════════════════════════════════════════════
 * EGA — FILIALLI TARIFDA TO'SILADI, FILIALSIZDA YO'Q
 * ══════════════════════════════════════════════════════════════════════
 *
 * Shart `branchesEnabled`, `multiBranch` EMAS (izohi
 * `shared/hooks/useAuth.js` da: biri tarif, ikkinchisi bazadagi fakt).
 *
 * ── FILIALLI (branchesEnabled = true): EGA KIRA OLMAYDI ──
 *
 * Ega `/org` da ishlaydi, filial ishi filial adminining vazifasi.
 * Manzilni qo'lda yozsa ham `/org` ga qaytariladi — devor ikki
 * tomonlama.
 *
 * ── FILIALSIZ (branchesEnabled = false): EGA ODDIY ADMIN ──
 *
 * `/org` umuman yo'q, ya'ni bu yerda qaytarish CHEKSIZ HALQA bo'lardi
 * (`/owner` → `/org` → `SuperAdminGuard` → `/owner` → ...). Ega,
 * administrator va admin panelga ruxsati bor har bir xodim shu yerda.
 *
 * ── HALQA TAHLILI ──
 *
 *   ega + filialli   : `/owner` → `/org`, `SuperAdminGuard` O'TKAZADI → to'xtaydi
 *   ega + filialsiz  : `/org` → `/owner/dashboard`, bu qo'riqchi O'TKAZADI → to'xtaydi
 *
 * ⚠ IKKALA QO'RIQCHI HAM `isLoading` PAYTIDA `null` QAYTARISHI SHART:
 * `branchesEnabled` kelmaguncha qaror qabul qilinsa, bir render
 * davomida noto'g'ri yo'naltirish bo'ladi va WebKit'da bu haqiqiy
 * halqaga aylanishi mumkin (`app/routes.jsx` oxiridagi izoh).
 *
 * ── XODIM ──
 * Xodim (resepshin) ilgarigidek to'silmaydi: uning menyusi `/work`,
 * lekin bir nechta operatsion sahifa o'sha menyudan ochiladi.
 *
 * ── BU XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi (rol + ruxsat + filial ko'lami, har
 * so'rovda). Bu qo'riqchi odamni to'g'ri panelda ushlab turadi, xolos.
 */
const AdminPanelGuard = ({ children }) => {
  const auth = useAuth();

  if (auth.isLoading) return null;

  const type = auth.roleType || auth.role;

  if (type === ROLE_TYPES.STUDENT) return <Navigate to="/me" replace />;
  if (type === ROLE_TYPES.TEACHER) return <Navigate to="/teacher" replace />;

  // Filialli tarifdagi ega — `/org` ning egasi, bu panel emas.
  if (auth.branchesEnabled && type === ROLE_TYPES.OWNER) {
    return <Navigate to="/org" replace />;
  }

  return children;
};

export default AdminPanelGuard;
