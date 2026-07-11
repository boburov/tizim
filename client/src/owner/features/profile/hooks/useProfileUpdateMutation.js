import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { profileAPI } from "../api/profile.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useProfileUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      profileAPI.updateProfile(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.auth.me() });
      toast.success("Profil yangilandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useProfileUpdateMutation;
