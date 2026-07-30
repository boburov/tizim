// Router
import { Navigate, Outlet } from "react-router-dom";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useActiveBranch from "@/shared/hooks/useActiveBranch";

// Components
import BranchPicker from "@/shared/components/branch/BranchPicker";

const AuthGuard = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;
  const { isLoading, isError } = useAuth();
  const { needsBranchChoice } = useActiveBranch();

  if (!token) return <Navigate to="/login" replace />;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center fixed inset-0 z-50 size-full bg-muted">
        <div className="size-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (isError) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("authToken");
    }
    return <Navigate to="/login" replace />;
  }

  // FILIAL TANLASH: bir nechta filiali borlar avval qaysi biri bilan
  // ishlashini tanlaydi. Bitta filiali borlar bu ekranni ko'rmaydi.
  if (needsBranchChoice) return <BranchPicker />;

  return <Outlet />;
};

export default AuthGuard;
