import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

// Tasdiqdan keyin moliya ma'lumotlari ham o'zgaradi (pul chiqadi),
// shuning uchun butun keshni yangilaymiz.
const invalidateAll = (qc) => {
  qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
  qc.invalidateQueries({ queryKey: qk.finance.all() });
  qc.invalidateQueries({ queryKey: qk.teacherSalary.all() });
};

export const useApproveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) =>
      expenseApprovalsAPI.approve(id, { note }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("Tasdiqlandi va to'lov amalga oshirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useRejectMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }) =>
      expenseApprovalsAPI.reject(id, { note }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("Rad etildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useCancelApprovalMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => expenseApprovalsAPI.cancel(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("So'rov bekor qilindi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
