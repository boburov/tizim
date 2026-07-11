import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { holidaysAPI } from "../api/holidays.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const handleErr = (err) =>
  apiErrorToast(err);

export const useHolidayCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => holidaysAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.holidays.all() });
      toast.success("Bayram qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useHolidayUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      holidaysAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.holidays.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

// O'qituvchiga tug'ilgan kun tabrigini yuborish (tg / platforma / ikkalasi).
export const useCongratulateTeacherMutation = (options = {}) => {
  return useMutation({
    mutationFn: ({ id, body }) =>
      holidaysAPI.congratulate(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      toast.success("Tabrik yuborildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useHolidayRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => holidaysAPI.remove(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.holidays.all() });
      toast.success("O'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};
