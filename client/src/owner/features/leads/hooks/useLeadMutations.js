import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { leadsAPI } from "../api/leads.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const onErr = (options) => (err) => {
  apiErrorToast(err);
  options.onError?.(err);
};

export const useLeadCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => leadsAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Lid qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => leadsAPI.remove(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("O'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadReminderMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.setReminder(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Eslatma saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadConvertMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.convert(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      qc.invalidateQueries({ queryKey: qk.users.all() });
      toast.success("Lid o'quvchiga aylantirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};
