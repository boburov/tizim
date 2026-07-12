// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Sonner
import { toast } from "sonner";

// API + utils + keys
import { studentFreezeAPI } from "../api/studentFreeze.api";
import { apiErrorToast } from "@/shared/utils/apiError";
import { qk } from "@/shared/lib/query/keys";

// Muzlatish/chiqarish o'quvchining davomat va to'loviga ta'sir qiladi, shu sabab
// tegishli barcha keshlarni bekor qilamiz.
const invalidateAll = (qc, studentId) => {
  qc.invalidateQueries({ queryKey: qk.users.all() });
  qc.invalidateQueries({ queryKey: qk.users.one(studentId) });
  qc.invalidateQueries({ queryKey: qk.studentFreezes.byStudent(studentId) });
  qc.invalidateQueries({ queryKey: qk.attendance.all() });
  qc.invalidateQueries({ queryKey: qk.finance.all() });
  qc.invalidateQueries({ queryKey: qk.financeReport.all() });
};

export const useStudentFreezeMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, startDate, reason } = {}) =>
      studentFreezeAPI.freeze(id, { startDate, reason }).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc, vars.id);
      toast.success("O'quvchi muzlatildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useStudentUnfreezeMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endDate } = {}) =>
      studentFreezeAPI.unfreeze(id, { endDate }).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc, vars.id);
      toast.success("O'quvchi muzlatishdan chiqarildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
