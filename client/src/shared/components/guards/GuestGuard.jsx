// Router
import { Navigate, Outlet, useLocation } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useWorkspace from "@/shared/hooks/useWorkspace";

/**
 * Kirgan foydalanuvchi login sahifasini ochsa — o'z bosh sahifasiga.
 *
 * Manzil ISH MAKONIDAN keladi (`useWorkspace`), rol sozlamasidagi
 * `defaultPath` satridan emas: u eskirishi mumkin va o'shanda odam
 * har safar noto'g'ri panelga tushardi.
 */
const GuestGuard = () => {
  const { pathname } = useLocation();
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { role, isLoading, isError } = useAuth();
  const { home } = useWorkspace();

  if (token && isLoading) return null;
  if (token && !isError && role) {
    const target = home;
    // Rol sozlamasi noto'g'ri bo'lib, landing sahifa aynan shu sahifani
    // ko'rsatsa - redirect qilmaymiz, aks holda guard o'zini o'zi cheksiz
    // qayta chaqiradi (qarang: RoleGuard dagi halqa himoyasi).
    if (target !== pathname) return <Navigate to={target} replace />;
  }

  return <Outlet />;
};

export default GuestGuard;
