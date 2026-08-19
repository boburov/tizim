import { Navigate } from "react-router-dom";

import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";
import useWorkspace from "@/shared/hooks/useWorkspace";
import { ROLE_TYPES } from "@/shared/constants/roles";
import { hasOrgAuthority } from "@/shared/workspaces/workspaces";

/**
 * ══════════════════════════════════════════════════════════════════════
 * SUPER ADMIN PANELIGA KIRISH
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BU XAVFSIZLIK EMAS ──
 * Ma'lumotni server qo'riqlaydi: har so'rovda rol, ruxsat va filial
 * ko'lami tekshiriladi (`server/src/middleware/auth.js`). Bu qo'riqchi
 * faqat ODAMNI TO'G'RI PANELGA olib boradi — filial administratori
 * tasodifan `/org` ni ochsa, u yarim bo'sh, 403 ga to'lgan ekran
 * o'rniga o'z panelida qoladi.
 *
 * ── KIM KIRADI ──
 * Ega — har doim. Qolganlar uchun IKKALA kalit ham shart:
 *   • `branches.view_all`   — barcha filialni birdan ko'rish
 *   • `system.admin_access` — tashkilot darajasidagi amallar
 *                             (filial ochish aynan shu kalit bilan
 *                             qulflangan — `branches.routes.js`)
 *
 * Faqat `view_all` bo'lgan odam — konsolidatsiya hisobotini o'qiydigan
 * buxgalter. Unga Super Admin panelini ochish "filial qo'shing" degan
 * yolg'on va'da bo'lardi: server baribir 403 qaytaradi.
 *
 * ══════════════════════════════════════════════════════════════════════
 * YO'NALTIRISH MANZILI — `useWorkspace().home`, QATTIQ YOZILGAN YO'L EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ilgari bu yerda `/owner/dashboard` qattiq yozilgan edi va u XATO
 * ishlardi: `/org` ni ochgan RESEPSHIN ham o'sha manzilga tushardi,
 * holbuki unda `admin_dashboard.read` YO'Q — ya'ni odam bitta yopiq
 * eshikdan ikkinchisiga uzatilardi. Brauzer testi buni aynan shunday
 * tutdi: xodim `/org` dan `/owner/dashboard` ga ketardi.
 *
 * `home` odamning RUXSATLARIDAN hisoblanadi, ya'ni u har doim
 * ochiladigan sahifa: ega/tashkilot → `/org`, administrator →
 * `/owner/dashboard`, xodim → `/work`, o'quvchi → `/me`.
 *
 * HALQA XAVFI YO'Q: `home` `/org` bo'lgan odam bu qo'riqchidan
 * O'TADI (u tashkilot vakolatiga ega), ya'ni "/org → /org" aylanishi
 * hosil bo'lmaydi.
 */
const SuperAdminGuard = ({ children }) => {
  const auth = useAuth();
  const { has } = usePermissions();
  const { home, isLoading } = useWorkspace();

  if (auth.isLoading || isLoading) return null;

  const type = auth.roleType || auth.role;
  const allowed = type === ROLE_TYPES.OWNER || hasOrgAuthority(has);

  if (!allowed) return <Navigate to={home || "/"} replace />;

  return children;
};

export default SuperAdminGuard;
