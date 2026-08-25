// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Toast
import { toast } from "sonner";

// API
import { marketAPI } from "@/shared/api/market.api";
import { coinsAPI } from "@/shared/api/coins.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Utils
import { apiErrorToast } from "@/shared/utils/apiError";

const handleErr = (err) => apiErrorToast(err);

/**
 * ⚠ BUYURTMA MUTATSIYASI TANGA KESHINI HAM BEKOR QILADI.
 *
 * Rad etish/bekor qilish TANGANI QAYTARADI, ya'ni balans o'zgaradi.
 * Faqat `qk.market.all()` bekor qilinsa hamyon ekrani eski raqamni
 * ko'rsatib turardi va o'quvchi "tanga qaytarilmadi" deb o'ylardi.
 */
const invalidateAll = (qc) => {
  qc.invalidateQueries({ queryKey: qk.market.all() });
  qc.invalidateQueries({ queryKey: qk.coins.all() });
};

export const useProductCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => marketAPI.createProduct(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.market.all() });
      toast.success("Mahsulot qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};

export const useProductUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      marketAPI.updateProduct(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.market.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};

export const useProductRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => marketAPI.removeProduct(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.market.all() });
      toast.success("Mahsulot o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};

export const useOrderStatusMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      marketAPI.setOrderStatus(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("Holat yangilandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};

/**
 * SOZLAMALAR — O'CHIRGICH SHU YERDA.
 *
 * ⚠ `qk.coinConfig.all()` HAM bekor qilinadi. `config` alohida
 * ildizda yashaydi (`keys.js` dagi izoh) va u bekor qilinmasa
 * o'chirgich bosilgach menyu yozuvi 5 daqiqagacha ekranda qolib
 * ketardi — foydalanuvchi esa uni bosib 404 olardi.
 */
export const useCoinSettingsMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => coinsAPI.updateSettings(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.coins.all() });
      qc.invalidateQueries({ queryKey: qk.coinConfig.all() });
      qc.invalidateQueries({ queryKey: qk.market.all() });
      toast.success("Sozlamalar saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};

/** Qo'lda tanga berish / olib qo'yish. */
export const useCoinAdjustMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => coinsAPI.adjust(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.coins.all() });
      toast.success(
        Number(vars?.delta) > 0 ? "Tanga berildi" : "Tanga olib qo'yildi",
      );
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      handleErr(err);
      options.onError?.(err);
    },
  });
};
