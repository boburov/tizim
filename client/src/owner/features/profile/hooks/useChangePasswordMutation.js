import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { profileAPI } from "../api/profile.api";
import { apiErrorToast } from "@/shared/utils/apiError";

// Parol o'zgargach backend barcha sessiyalarni bekor qiladi -> qayta login kerak
const useChangePasswordMutation = (options = {}) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (body) => profileAPI.changePassword(body),
    onSuccess: (data, vars, ctx) => {
      options.onSuccess?.(data, vars, ctx);
      localStorage.removeItem("authToken");
      qc.clear();
      toast.success("Parol o'zgartirildi. Qaytadan kiring");
      navigate("/login", { replace: true });
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useChangePasswordMutation;
