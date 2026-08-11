import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

// Maosh o'zgarishlari ko'p query'ga ta'sir qiladi → barchasini invalidate qilamiz.
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.teacherSalary.all() });
};

const makeMutation = (mutationFn, successMsg) => (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn,
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

export const useAddSalaryPayoutMutation = makeMutation(
  (body) => teacherSalaryAPI.addTransaction(body).then((r) => r.data.data),
  "To'lov amalga oshirildi",
);

export const useRemoveSalaryPayoutMutation = makeMutation(
  (id) => teacherSalaryAPI.removeTransaction(id).then((r) => r.data.data),
  "To'lov bekor qilindi",
);

// ── MUKOFOT / JARIMA ──
// To'lovdan farqi: bu PUL HARAKATI EMAS, oylik REJASIGA yangi qator qo'shadi.
// Server `amount` ni HAR DOIM musbat kutadi - ishorani `kind` hal qiladi.
// Muvaffaqiyat matni chaqiruvchida beriladi (jarima/bonus so'zi farq qiladi).
export const useAddSalaryAdjustmentMutation = makeMutation((body) =>
  teacherSalaryAPI.addAdjustment(body).then((r) => r.data.data),
);

export const useRemoveSalaryAdjustmentMutation = makeMutation(
  (id) => teacherSalaryAPI.removeAdjustment(id).then((r) => r.data.data),
  "O'chirildi",
);
