import { useMutation, useQueryClient } from "@tanstack/react-query";
import { botAuthAPI } from "../api/botAuth.api";
import { qk } from "@/shared/lib/query/keys";

// Mini ilovada login+parol bilan kirish va Telegram ID ni avtomatik bog'lash
const useBotAuthLoginMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => botAuthAPI.login(body).then((r) => r.data.data),
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

export default useBotAuthLoginMutation;
