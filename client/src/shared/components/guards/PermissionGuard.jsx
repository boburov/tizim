// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import usePermissions from "@/shared/hooks/usePermissions";

// Array of permissions means hasAll (every one is required)
const PermissionGuard = ({ required, children, fallback = "/" }) => {
  const { isLoading } = useAuth();
  const { has, hasAll } = usePermissions();

  // Ruxsatlar /auth/me bilan keladi - yuklanmaguncha redirect qilmaymiz,
  // aks holda sahifa har yangilanganda fallback'ga otilib ketardi.
  if (isLoading) return null;

  const ok = Array.isArray(required) ? hasAll(required) : has(required);
  if (!ok) return <Navigate to={fallback} replace />;

  return children || <Outlet />;
};

export default PermissionGuard;
