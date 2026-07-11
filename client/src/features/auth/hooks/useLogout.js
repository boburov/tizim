// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Router
import { useNavigate } from "react-router-dom";

// Sonner
import { toast } from "sonner";

// API
import { authAPI } from "../api/auth.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useLogout = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => authAPI.logout().catch(() => null),
    onSettled: () => {
      localStorage.removeItem("authToken");
      qc.removeQueries({ queryKey: qk.auth.me() });
      qc.clear();
      toast.success("Tizimdan chiqdingiz");
      navigate("/login", { replace: true });
    },
  });
};

export default useLogout;
