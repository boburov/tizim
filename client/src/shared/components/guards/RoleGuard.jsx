// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLE_HOME } from "@/shared/constants/roles";

const RoleGuard = ({ roles, children }) => {
  const { role, isLoading } = useAuth();

  if (isLoading) return null;

  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!role || !allowed.includes(role)) {
    return <Navigate to={ROLE_HOME[role] || "/login"} replace />;
  }

  return children || <Outlet />;
};

export default RoleGuard;
