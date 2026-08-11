// Router
import { Navigate, Outlet, useLocation } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { resolveHomePath } from "@/shared/constants/roles";

const GuestGuard = () => {
  const { pathname } = useLocation();
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { role, roleType, homePath, isLoading, isError } = useAuth();

  if (token && isLoading) return null;
  if (token && !isError && role) {
    const target = resolveHomePath({ defaultPath: homePath, role, roleType });
    // Rol sozlamasi noto'g'ri bo'lib, landing sahifa aynan shu sahifani
    // ko'rsatsa - redirect qilmaymiz, aks holda guard o'zini o'zi cheksiz
    // qayta chaqiradi (qarang: RoleGuard dagi halqa himoyasi).
    if (target !== pathname) return <Navigate to={target} replace />;
  }

  return <Outlet />;
};

export default GuestGuard;
