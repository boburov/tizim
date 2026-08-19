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
      // "/" GA YUBORAMIZ, aniq manzilga emas.
      //
      // Bosh sahifa endi ISH MAKONIDAN aniqlanadi, u esa RUXSATLARDAN
      // hisoblanadi (`useWorkspace`). Login javobida ruxsatlar YO'Q —
      // ular `/auth/me` bilan keladi. Ya'ni bu yerda manzilni hisoblash
      // eskirgan `roleMeta.defaultPath` ga tayanishni anglatardi:
      // egaga yangi vakolat berilsa ham u eski panelga tushib
      // qolaverardi.
      //
      // "/" esa `RoleHomeRedirect` ga boradi va u YAGONA manbadan
      // (ish makoni) foydalanadi — landing mantig'i ikkilanmaydi.
      navigate("/", { replace: true });
    },
    onError: (err) => {
      apiErrorToast(err, "Login yoki parol noto'g'ri");
    },
  });
};

export default useLoginMutation;
