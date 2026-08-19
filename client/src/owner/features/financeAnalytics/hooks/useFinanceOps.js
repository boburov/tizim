import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { financeOpsAPI } from "../api/financeAnalytics.api";
import { qk } from "@/shared/lib/query/keys";

/**
 * MOLIYAVIY AMALLAR (yozish) + TAHLILNI YANGILASH.
 *
 * ── NEGA HAR AMALDAN KEYIN `invalidate` ──
 * Chiqim yozilgach ekranda eski "Xarajat" raqami turib qolsa,
 * foydalanuvchi amal O'TMAGAN deb o'ylab qayta uradi — natijada pul
 * ikki marta yoziladi. Idempotentlik buni serverda to'sadi, lekin
 * chalkashlikning o'zi ham xato: raqam DARHOL yangilanishi kerak.
 *
 * BUTUN `financeAnalytics` daraxti bekor qilinadi: bitta to'lov
 * xulosaga ham, daromadga ham, qarzdorlikka ham, foydalilikka ham
 * ta'sir qiladi. Qaysi biri ekanini sanab chiqish — eskirib qoladigan
 * ro'yxat.
 */
const useInvalidateFinance = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.financeAnalytics.all() });
    qc.invalidateQueries({ queryKey: qk.financeReport.all() });
  };
};

const useFinanceOp = (fn, successText) => {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      // Takroriy urinish (idempotentlik) — bu XATO EMAS, lekin
      // foydalanuvchi "yana bir marta yozildi" deb o'ylamasligi kerak.
      if (res?.data?.data?.duplicate) {
        toast.info("Bu amal allaqachon yozilgan — takror yozilmadi");
      } else {
        toast.success(successText);
      }
      invalidate();
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Amal bajarilmadi");
    },
  });
};

export const useRefundMutation = () =>
  useFinanceOp(financeOpsAPI.refund, "Qaytarim yozildi");
export const useTransferMutation = () =>
  useFinanceOp(financeOpsAPI.transfer, "O'tkazma bajarildi");
export const useOwnerCapitalMutation = () =>
  useFinanceOp(financeOpsAPI.ownerCapital, "Yozuv qo'shildi");

export { useInvalidateFinance };
