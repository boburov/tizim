import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceExemptionsAPI } from "../api/attendanceExemptions.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useExemptionCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      attendanceExemptionsAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendanceExemptions.all() });
      qc.invalidateQueries({ queryKey: qk.users.one(vars.student) });
      // Imtiyoz davomat foiziga ta'sir qiladi → barcha davomat query'lari yangilanadi
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("Davomatdan ozod davri yaratildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useExemptionUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      attendanceExemptionsAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendanceExemptions.all() });
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useExemptionRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => attendanceExemptionsAPI.remove(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendanceExemptions.all() });
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("O'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
