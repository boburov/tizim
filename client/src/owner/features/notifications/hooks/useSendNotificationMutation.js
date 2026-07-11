import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useSendNotificationMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => notificationsAPI.send(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.notifications.all() });
      toast.success("Xabar yuborildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useSendNotificationMutation;
