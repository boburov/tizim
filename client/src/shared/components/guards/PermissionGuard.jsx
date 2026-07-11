// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import usePermissions from "@/shared/hooks/usePermissions";

// Array of permissions means hasAll (every one is required)
const PermissionGuard = ({ required, children, fallback = "/" }) => {
  const { has, hasAll } = usePermissions();

  const ok = Array.isArray(required) ? hasAll(required) : has(required);
  if (!ok) return <Navigate to={fallback} replace />;

  return children || <Outlet />;
};

export default PermissionGuard;
