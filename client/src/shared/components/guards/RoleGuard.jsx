// Router
import { Navigate, Outlet, useLocation } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Components
import AccessDenied from "./AccessDenied";

// Constants
import { ROLES, ROLE_HOME } from "@/shared/constants/roles";

const RoleGuard = ({ roles, children }) => {
  const { pathname } = useLocation();
  const { role, roleType, homePath, isLoading } = useAuth();

  if (isLoading) return null;

  const allowed = Array.isArray(roles) ? roles : [roles];

  // Rol nomi YOKI rol tipi mos kelsa o'tkazamiz. Custom "Buxgalter" roli
  // roleType="owner" bo'lsa /owner bo'limiga kira oladi - aks holda har bir
  // yangi rol uchun route'ni qo'lda o'zgartirish kerak bo'lardi.
  //
  // UCHINCHI YO'L - defaultPath: roleType="staff" bo'lgan rollar (direktor,
  // buxgalter) na `role`, na `roleType` bo'yicha mos kelmaydi, lekin
  // serverdagi defaultPath ular qaysi panelga tegishli ekanini aytadi.
  // Busiz direktor /owner ga kira olmay, cheksiz redirect halqasiga
  // tushardi va ekran bo'sh qolardi.
  const sectionMatchesHome =
    Boolean(homePath) &&
    allowed.some((r) => homePath === `/${r}` || homePath.startsWith(`/${r}/`));

  // TO'RTINCHI YO'L - RAHBARIYAT QOBIG'I (`/admin`).
  //
  // `/admin` ROL EMAS, owner panelining ikkinchi qarashi (qarang
  // `admin/index.js`): uning HAMMA drill-down manzili `/owner/*` ga
  // ketadi. Ya'ni `defaultPath = "/admin"` bo'lgan foydalanuvchi
  // owner bo'limiga TEGISHLI.
  //
  // BUSIZ IKKI TUGUNLI CHEKSIZ HALQA yopilardi:
  //   /admin -> ruxsat yo'q -> PermissionGuard fallback -> /owner
  //   /owner -> RoleGuard rad etadi -> homePath ("/admin") ga -> /admin
  //   ... va hokazo.
  //
  // Bu "bezarar sekinlik" emas: har qadam `history.replaceState()`
  // chaqiradi va WebKit 10 soniyada 100 tadan keyin SecurityError otib
  // butun ilovani yiqitadi (shu fayldagi pastki izohga qarang -
  // Telegram mini ilova aynan shundan qulagan).
  const isExecutiveHome =
    Boolean(homePath) &&
    (homePath === "/admin" || homePath.startsWith("/admin/")) &&
    allowed.includes(ROLES.OWNER);

  const isAllowed =
    Boolean(role) &&
    (allowed.includes(role) ||
      allowed.includes(roleType) ||
      sectionMatchesHome ||
      isExecutiveHome);

  if (!isAllowed) {
    // Landing sahifa serverdagi rol sozlamasidan (defaultPath) keladi.
    const target = homePath || ROLE_HOME[roleType] || ROLE_HOME[role] || null;

    // HALQA HIMOYASI. Ikki holat cheksiz redirectga olib kelardi:
    //   1) nishon yo'q -> `/login` -> GuestGuard kirgan foydalanuvchini
    //      darhol panelga qaytaradi -> yana shu yerga -> ...
    //   2) nishon shu bo'limning O'ZI (masalan "/owner", biz esa
    //      "/owner/..." damiz) -> guard o'zini o'zi qayta chaqiradi.
    //
    // Halqa "bezarar sekinlik" emas: har qadam `history.replaceState()`
    // chaqiradi va WebKit 10 soniyada 100 tadan keyin SecurityError otib,
    // butun ilovani yiqitadi (Telegram mini ilova aynan shundan qulagan).
    // Shuning uchun bu yerda TO'XTAYMIZ - sabab ko'rsatilgan ekran bilan.
    const wouldLoop =
      !target || pathname === target || pathname.startsWith(`${target}/`);

    if (wouldLoop) return <AccessDenied />;

    return <Navigate to={target} replace />;
  }

  return children || <Outlet />;
};

export default RoleGuard;
