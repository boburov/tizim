import { Navigate } from "react-router-dom";

import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import { ROLE_TYPES } from "@/shared/constants/roles";
import { hasOrgAuthority } from "@/shared/workspaces/workspaces";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ADMIN PANELI — DIREKTORLAR UCHUN
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NIMANI TO'SADI ──
 * Tashkilot vakolatiga ega odam (ega yoki `branches.view_all` +
 * `system.admin_access`) `/owner/*` ga KIRA OLMAYDI — u o'z paneliga
 * (`/org`) qaytariladi.
 *
 * ── NEGA ──
 * Ikki panel bir-birining ichiga kirib turgan bo'lsa, ular amalda
 * bitta panel bo'lib qoladi:
 *
 *   • Super Admin operatsion ekranlarda ishlay boshlaydi va tashkilot
 *     ko'rinishi "hisobot" darajasiga tushib qoladi;
 *   • Admin paneli esa "kimningdir bir qismi" bo'lib o'qiladi —
 *     direktor o'zi ko'ra olmaydigan bo'limga olib boradigan tugmani
 *     bosib yuradi.
 *
 * Shuning uchun devor IKKI TOMONLAMA: bu qo'riqchi Super Adminni
 * `/owner/*` dan, `SuperAdminGuard` esa direktorni `/org/*` dan
 * qaytaradi. Panellar orasida navigatsiya havolasi ham YO'Q.
 *
 * ── XODIM VA O'QITUVCHI ──
 * Xodim (resepshin) ATAYLAB to'silmaydi: uning o'z paneli `/work`, lekin
 * bir nechta operatsion sahifa (`/owner/leads`, `/owner/attendance`)
 * o'sha menyudan ochiladi va bu ilgari ham shunday edi. Bu ish
 * "Admin panelida ishlash" emas — unga menyu ham, bosh sahifa ham
 * berilmaydi.
 *
 * O'qituvchi CHIQARIB tashlanadi: uning to'liq paneli bor
 * (`/teacher/*`) va operatsion panel unga ilgari ham yopiq edi.
 *
 * ── BU XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi (rol + ruxsat + filial ko'lami, har
 * so'rovda). Bu qo'riqchi odamni to'g'ri panelda ushlab turadi, xolos.
 */
const AdminPanelGuard = ({ children }) => {
  const auth = useAuth();
  const { has } = usePermissions();

  if (auth.isLoading) return null;

  const type = auth.roleType || auth.role;

  if (type === ROLE_TYPES.STUDENT) return <Navigate to="/me" replace />;
  if (type === ROLE_TYPES.TEACHER) return <Navigate to="/teacher" replace />;

  // Tashkilot darajasidagi odam — o'z paneliga.
  if (type === ROLE_TYPES.OWNER || hasOrgAuthority(has)) {
    return <Navigate to="/org" replace />;
  }

  return children;
};

export default AdminPanelGuard;
