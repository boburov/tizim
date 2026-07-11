import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { leadOptionsAPI } from "../api/leadOptions.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const onErr = (options) => (err) => {
  apiErrorToast(err);
  options.onError?.(err);
};

export const useLeadOptionCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => leadOptionsAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leadOptions.all() });
      toast.success("Qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadOptionUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadOptionsAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leadOptions.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadOptionRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => leadOptionsAPI.remove(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leadOptions.all() });
      toast.success("O'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};
