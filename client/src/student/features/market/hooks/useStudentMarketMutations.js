// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Toast
import { toast } from "sonner";

// API
import { marketAPI } from "@/shared/api/market.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Utils
import { apiErrorToast } from "@/shared/utils/apiError";

/**
 * ⚠ XARID UCHTA KESHNI BIRDAN ESKIRTIRADI:
 *   • hamyon        — tanga yechildi
 *   • katalog       — zaxira kamaydi va "yetadi/yetmaydi" o'zgardi
 *   • buyurtmalarim — yangi qator qo'shildi
 *
 * Faqat bittasi bekor qilinsa ekran o'zi bilan ziddiyatga tushardi:
 * balans kamaygan, lekin mahsulot hamon "sotib olish mumkin" bo'lib
 * turardi.
 */
const invalidate = (qc) => {
  qc.invalidateQueries({ queryKey: qk.coins.all() });
  qc.invalidateQueries({ queryKey: qk.market.all() });
};

export const useBuyMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => marketAPI.buy(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Xaridingiz qabul qilindi", {
        description: "Batafsil ma'lumot xabarlaringizga yuborildi",
      });
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useCancelOrderMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => marketAPI.cancelOrder(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Buyurtma bekor qilindi", {
        description: "Tanga hisobingizga qaytarildi",
      });
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
