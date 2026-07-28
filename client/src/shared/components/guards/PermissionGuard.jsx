// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";

// `required` - bitta kalit yoki massiv (massiv = hasAll, HAMMASI kerak).
// `anyOf`   - massiv, KAMIDA BITTASI yetarli. Bitta sahifa ikki xil ruxsat
//             egasiga ochiq bo'lganda kerak (mas. tasdiqlar sahifasi:
//             moliya tasdiqlovchisi ham, sozlama tasdiqlovchisi ham kiradi).
// Ikkalasi birga berilsa - ikkala shart ham bajarilishi kerak.
const PermissionGuard = ({ required, anyOf, children, fallback = "/" }) => {
  const { isLoading } = useAuth();
  const { has, hasAll, hasAny } = usePermissions();

  // Ruxsatlar /auth/me bilan keladi - yuklanmaguncha redirect qilmaymiz,
  // aks holda sahifa har yangilanganda fallback'ga otilib ketardi.
  if (isLoading) return null;

  let ok = true;
  if (required) ok = Array.isArray(required) ? hasAll(required) : has(required);
  if (ok && anyOf?.length) ok = hasAny(anyOf);
  if (!ok) return <Navigate to={fallback} replace />;

  return children || <Outlet />;
};

export default PermissionGuard;
