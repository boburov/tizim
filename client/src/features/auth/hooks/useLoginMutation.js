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
import { resolveHomePath } from "@/shared/constants/roles";

// Lib
import { clearActiveBranchId } from "@/shared/lib/branch/activeBranch";

const useLoginMutation = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (body) => authAPI.login(body).then((r) => r.data.data),
    onSuccess: (data) => {
      // FILIAL: oldingi foydalanuvchidan qolgan tanlovni TOZALAYMIZ.
      // Aks holda owner'dan keyin direktor kirsa, owner tanlagan filial
      // header'da ketardi - yoki eskirgan ID butun tizimni bloklardi.
      // Yangi tanlov useActiveBranch tomonidan /auth/me javobiga qarab
      // avtomatik qo'yiladi.
      clearActiveBranchId();
      localStorage.setItem("authToken", data.accessToken);
      qc.setQueryData(qk.auth.me(), {
        user: data.user,
        role: data.user.role,
        roleMeta: data.roleMeta,
      });
      qc.invalidateQueries({ queryKey: qk.auth.me() });
      toast.success("Tizimga xush kelibsiz");
      // Custom rolda landing sahifa ROLE_HOME map'ida yo'q - u serverdan
      // (roleMeta.defaultPath) keladi.
      navigate(
        resolveHomePath({
          defaultPath: data.roleMeta?.defaultPath,
          role: data.user.role,
          roleType: data.roleMeta?.roleType,
        }),
        { replace: true },
      );
    },
    onError: (err) => {
      apiErrorToast(err, "Login yoki parol noto'g'ri");
    },
  });
};

export default useLoginMutation;
