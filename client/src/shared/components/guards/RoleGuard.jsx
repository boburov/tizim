// Router
import { Navigate, Outlet, useLocation } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useWorkspace from "@/shared/hooks/useWorkspace";

// Components
import AccessDenied from "./AccessDenied";

/**
 * ══════════════════════════════════════════════════════════════════════
 * ROL QO'RIQCHISI — endi FAQAT `/teacher` va `/student` uchun
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NIMA SODDALASHDI ──
 * Ilgari bu qo'riqchi `/owner` ni ham himoya qilardi va buning uchun
 * uchta qo'shimcha yo'l bor edi: `roleType` mos kelishi, `defaultPath`
 * ning `/owner` bilan boshlanishi va `/admin` uchun alohida istisno.
 * Ularning HAMMASI bitta sababdan kelib chiqqan edi — dinamik rollar
 * (direktor, buxgalter) na rol nomi, na rol tipi bo'yicha mos
 * kelmasdi, shuning uchun ular ROL SOZLAMASIDAGI SATRGA
 * (`Role.defaultPath`) tayanardi.
 *
 * Bu mo'rt edi: o'sha satr bitta harfga o'zgarsa, butun panel yopilib
 * qolardi va buni hech qanday tekshiruv tutmasdi.
 *
 * Endi `/owner` ISH MAKONI qo'riqchisi ostida (`WorkspaceGuard`) va
 * makon RUXSATLARDAN hisoblanadi. Bu yerda esa faqat ikkita rol-spec
 * panel qoldi va ular uchun oddiy rol tekshiruvi yetarli.
 *
 * ── HALQA HIMOYASI SAQLANDI ──
 * Yo'naltirish nishoni ish makonining bosh sahifasi. U har doim
 * mavjud marshrut va o'zi qo'riqlanmaydi. Baribir ehtiyot chorasi
 * qoldirilgan: nishon shu sahifaning O'ZI bo'lsa yoki umuman
 * bo'lmasa — TO'XTAYMIZ.
 *
 * Halqa "bezarar sekinlik" emas: har qadam `history.replaceState()`
 * chaqiradi va WebKit 10 soniyada 100 tadan keyin SecurityError otib,
 * butun ilovani yiqitadi (Telegram mini ilova aynan shundan qulagan).
 */
const RoleGuard = ({ roles, children }) => {
  const { pathname } = useLocation();
  const { role, roleType, isLoading } = useAuth();
  const { home } = useWorkspace();

  if (isLoading) return null;

  const allowed = Array.isArray(roles) ? roles : [roles];

  // Rol nomi YOKI rol tipi mos kelsa o'tkazamiz. Custom "Katta
  // o'qituvchi" roli `roleType="teacher"` bo'lsa o'qituvchi paneliga
  // kiradi — aks holda har yangi rol uchun marshrutni qo'lda
  // o'zgartirish kerak bo'lardi.
  const isAllowed =
    Boolean(role) && (allowed.includes(role) || allowed.includes(roleType));

  if (!isAllowed) {
    const target = home;
    const wouldLoop =
      !target || pathname === target || pathname.startsWith(`${target}/`);

    if (wouldLoop) return <AccessDenied />;

    return <Navigate to={target} replace />;
  }

  return children || <Outlet />;
};

export default RoleGuard;
