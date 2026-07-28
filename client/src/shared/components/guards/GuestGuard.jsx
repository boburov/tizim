// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

// Constants
import { resolveHomePath } from "@/shared/constants/roles";

const GuestGuard = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { role, roleType, homePath, isLoading, isError } = useAuth();

  if (token && isLoading) return null;
  if (token && !isError && role) {
    return (
      <Navigate
        to={resolveHomePath({ defaultPath: homePath, role, roleType })}
        replace
      />
    );
  }

  return <Outlet />;
};

export default GuestGuard;
