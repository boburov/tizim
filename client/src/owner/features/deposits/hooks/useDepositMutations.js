import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { depositsAPI } from "../api/deposits.api";

// Depozit amallari balansga ham, oylik to'lovlarga (qoplama) ham ta'sir qiladi.
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.deposits.all() });
    qc.invalidateQueries({ queryKey: qk.finance.all() });
  };
};

const makeMutation = (fn, successMsg) => (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars, ctx) => {
      invalidate();
      if (successMsg) toast.success(successMsg);
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useDepositTopupMutation = makeMutation(
  (body) => depositsAPI.topup(body).then((r) => r.data.data),
  "Depozit qo'shildi",
);

export const useDepositWithdrawMutation = makeMutation(
  (body) => depositsAPI.withdraw(body).then((r) => r.data.data),
  "Depozitdan yechib olindi",
);

export const useDepositApplyMutation = makeMutation(
  (body) => depositsAPI.apply(body).then((r) => r.data.data),
  "Depozitdan qoplandi",
);

export const useDepositTxnRemoveMutation = makeMutation(
  (id) => depositsAPI.removeTransaction(id).then((r) => r.data.data),
  "Tranzaksiya o'chirildi",
);
