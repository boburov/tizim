// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Router
import { useNavigate } from "react-router-dom";

// Sonner
import { toast } from "sonner";

// API
import { authAPI } from "../api/auth.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Constants
import { ROLE_HOME } from "@/shared/constants/roles";

const useLoginMutation = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (body) => authAPI.login(body).then((r) => r.data.data),
    onSuccess: (data) => {
      localStorage.setItem("authToken", data.accessToken);
      qc.setQueryData(qk.auth.me(), { user: data.user, role: data.user.role });
      qc.invalidateQueries({ queryKey: qk.auth.me() });
      toast.success("Tizimga xush kelibsiz");
      navigate(ROLE_HOME[data.user.role] || "/", { replace: true });
    },
    onError: (err) => {
      apiErrorToast(err, "Login yoki parol noto'g'ri");
    },
  });
};

export default useLoginMutation;
