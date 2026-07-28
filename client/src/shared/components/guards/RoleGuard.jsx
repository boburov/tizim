// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLE_HOME } from "@/shared/constants/roles";

const RoleGuard = ({ roles, children }) => {
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

  const isAllowed =
    Boolean(role) &&
    (allowed.includes(role) || allowed.includes(roleType) || sectionMatchesHome);

  if (!isAllowed) {
    // Landing sahifa serverdagi rol sozlamasidan (defaultPath) keladi.
    return <Navigate to={homePath || ROLE_HOME[roleType] || "/login"} replace />;
  }

  return children || <Outlet />;
};

export default RoleGuard;
