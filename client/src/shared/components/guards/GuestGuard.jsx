// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { ROLE_HOME } from "@/shared/constants/roles";

const GuestGuard = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { role, isLoading, isError } = useAuth();

  if (token && isLoading) return null;
  if (token && !isError && role) {
    return <Navigate to={ROLE_HOME[role] || "/"} replace />;
  }

  return <Outlet />;
};

export default GuestGuard;
