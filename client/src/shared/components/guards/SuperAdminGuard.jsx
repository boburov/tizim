import { Navigate } from "react-router-dom";

import useAuth from "@/shared/hooks/useAuth";
import useWorkspace from "@/shared/hooks/useWorkspace";
import { ROLE_TYPES } from "@/shared/constants/roles";

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
 * ══════════════════════════════════════════════════════════════════════
 * KIM KIRADI — FAQAT EGA, VA FAQAT FILIALLI TARIFDA
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── FILIALSIZ TARIF: `/org` UMUMAN YO'Q ──
 *
 * `branchesEnabled = false` bo'lsa hech kim kirmaydi — ega ham. Filial
 * tushunchasi sotilmagan tenantda bu panel bitta filialning ma'lumotini
 * ikkinchi marta, boshqa menyu bilan ko'rsatardi.
 *
 * ── FILIALLI TARIF: FAQAT `roleType === owner` ──
 *
 * ⚠ O'ZGARISH: ilgari `hasOrgAuthority(has)` (`branches.view_all` +
 * `system.admin_access`) bo'lgan HAR KIM kirardi — buxgalter, filial
 * direktori. Endi kirmaydi.
 *
 * Bu ONGLI qaror va uning narxi bor: o'sha xodimlar `/org` dagi
 * filiallararo ko'rinishni yo'qotadi. Talab shunday: "super admin
 * faqat super admin panelga, admin esa admin panelga" — ya'ni `/org`
 * eganing MAKONI, lavozim darajasi emas.
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
  const { home, isLoading } = useWorkspace();

  // ⚠ YUKLANAYOTGANDA `null` — MAJBURIY. `branchesEnabled` kelmaguncha
  // qaror qabul qilsak, bir render davomida noto'g'ri yo'naltirish
  // bo'lardi va WebKit'da bu redirect halqasiga aylanishi mumkin
  // (`app/routes.jsx` oxiridagi izoh).
  if (auth.isLoading || isLoading) return null;

  const type = auth.roleType || auth.role;
  const allowed = auth.branchesEnabled && type === ROLE_TYPES.OWNER;

  // HALQA YO'Q: ruxsat berilmagan odamning `home` qiymati `/org` bo'lishi
  // mumkin emas — `resolveWorkspace` `/org` ni faqat filialli tarifdagi
  // egaga beradi, ya'ni bu yerdan o'tadigan odamga.
  if (!allowed) return <Navigate to={home || "/"} replace />;

  return children;
};

export default SuperAdminGuard;
