import { useMutation, useQueryClient } from "@tanstack/react-query";
import { botAuthAPI } from "../api/botAuth.api";
import { qk } from "@/shared/lib/query/keys";

const useBotAuthMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (initData) => botAuthAPI.verify(initData).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      localStorage.setItem("authToken", data.accessToken);
      qc.setQueryData(qk.auth.me(), { user: data.user, role: data.user.role });
      qc.invalidateQueries({ queryKey: qk.auth.me() });
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err, vars, ctx) => {
      options.onError?.(err, vars, ctx);
    },
  });
};

export default useBotAuthMutation;
