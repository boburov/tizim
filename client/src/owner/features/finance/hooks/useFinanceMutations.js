import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { unwrapApproval, approvalToast } from "@/shared/utils/approvalResponse";
import { financeAPI } from "../api/finance.api";

// Moliya o'zgarishlari ko'p query'ga ta'sir qiladi (to'lovlar, hisobot, guruh fee) →
// barchasini invalidate qilamiz. Guruh to'lovi/chegirma o'qituvchining billed maoshini
// ham o'zgartiradi → teacherSalary query'lari ham yangilanadi. Ortiqcha to'lov garovga
// (depozit) tushadi, fee kamayishi ortiqchani depozitga qaytaradi → depozit ham yangilanadi.
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.finance.all() });
    qc.invalidateQueries({ queryKey: qk.teacherSalary.all() });
    qc.invalidateQueries({ queryKey: qk.deposits.all() });
  };
};

// Guruh narxi ham chegirma kabi tasdiqdan o'tadi (ikkalasi tushumni
// kamaytiradi) - tasdiq talab qilinsa server 202 qaytaradi va narx
// O'ZGARMAYDI, shuning uchun moliya query'larini yangilash noto'g'ri bo'lardi.
export const useGroupFeeUpsertMutation = (options = {}) => {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => financeAPI.upsertGroupFee(body).then(unwrapApproval),
    onSuccess: (res, vars, ctx) => {
      if (res.pendingApproval) qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
      else invalidate();
      approvalToast(toast, res, "Guruh to'lovi saqlandi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useAddTransactionMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body) => financeAPI.addTransaction(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("To'lov qabul qilindi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useRemoveTransactionMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id) => financeAPI.removeTransaction(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("To'lov bekor qilindi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

// Tasdiq talab qilinsa server 202 qaytaradi va chegirma YOZILMAYDI -
// shunda moliya query'larini yangilash noto'g'ri bo'lardi (hech nima
// o'zgarmagan), buning o'rniga tasdiqlar ro'yxati yangilanadi.
export const useDiscountCreateMutation = (options = {}) => {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => financeAPI.createDiscount(body).then(unwrapApproval),
    onSuccess: (res, vars, ctx) => {
      if (res.pendingApproval) qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
      else invalidate();
      approvalToast(toast, res, "Chegirma qo'shildi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useDiscountUpdateMutation = (options = {}) => {
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => financeAPI.updateDiscount(id, body).then(unwrapApproval),
    onSuccess: (res, vars, ctx) => {
      if (res.pendingApproval) qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
      else invalidate();
      approvalToast(toast, res, "Chegirma yangilandi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useDiscountRemoveMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id) => financeAPI.removeDiscount(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Chegirma o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
