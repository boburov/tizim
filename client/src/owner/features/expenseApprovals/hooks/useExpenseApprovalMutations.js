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

export const useRetryApprovalMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => expenseApprovalsAPI.retry(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("So'rov qayta tasdiqlashga qo'yildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

/**
 * OMMAVIY qaror. Server QISMAN muvaffaqiyatni normal holat deb qaytaradi
 * (`{ succeeded, failed }`), shuning uchun `onSuccess` ichida ham xato
 * bo'lishi mumkin - toast shunga qarab tanlanadi.
 */
export const useBulkDecideMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids, note }) =>
      (action === "reject"
        ? expenseApprovalsAPI.bulkReject({ ids, note })
        : expenseApprovalsAPI.bulkApprove({ ids, note })
      ).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      if (data.failed?.length) {
        // Birinchi sababni ko'rsatamiz - qolganini batafsil oynada ko'radi.
        toast.warning(
          `${data.succeeded.length} ta bajarildi, ${data.failed.length} ta o'tmadi`,
          { description: data.failed[0]?.reason },
        );
      } else {
        toast.success(`${data.succeeded.length} ta so'rov bajarildi`);
      }
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
