import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usersAPI } from "../api/users.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useUserRestoreMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reasonId } = {}) =>
      usersAPI.restore(id, { reasonId }).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.users.all() });
      toast.success("Tiklandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useUserRestoreMutation;
