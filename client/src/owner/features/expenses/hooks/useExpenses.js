import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { qk } from "@/shared/lib/query/keys";
import { expensesAPI } from "../api/expenses.api";

/**
 * CHIQIM SO'ROVLARI VA AMALLARI.
 *
 * ── NEGA `financeAnalytics` HAM BEKOR QILINADI ──
 * Chiqim yozilishi bilan kassa qoldig'i, pul oqimi va foyda BIR
 * VAQTDA o'zgaradi (server chiqimni jurnalga atomik yozadi). Faqat
 * chiqim ro'yxati yangilansa, foydalanuvchi "Pul oqimi" bo'limida
 * ESKI raqamni ko'rib turardi va amal o'tmagan deb o'ylab qayta
 * bosardi.
 */
const useInvalidateExpenses = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.expenses.all() });
    qc.invalidateQueries({ queryKey: qk.financeAnalytics.all() });
    qc.invalidateQueries({ queryKey: qk.journal.all() });
    qc.invalidateQueries({ queryKey: qk.expenseApprovals.all() });
  };
};

export const useExpensesQuery = (params, opts = {}) =>
  useQuery({
    queryKey: qk.expenses.list(params),
    // Ro'yxat ham, jami ham KERAK: `meta.totalAmount` butun filtr
    // bo'yicha (sahifadan mustaqil), shuning uchun javob to'liq
    // saqlanadi va `data` bilan cheklanmaydi.
    queryFn: () => expensesAPI.list(params).then((r) => r.data),
    staleTime: 30_000,
    ...opts,
  });

export const useExpenseCategoriesQuery = (opts = {}) =>
  useQuery({
    queryKey: qk.expenses.categories({}),
    queryFn: () => expensesAPI.categories().then((r) => r.data.data),
    // Kategoriya lug'ati kunda bir marta o'zgaradi — har panel
    // ochilganda qayta so'rashning ma'nosi yo'q.
    staleTime: 10 * 60_000,
    ...opts,
  });

/**
 * CHIQIM YARATISH.
 *
 * ── 202 «TASDIQ KUTILMOQDA» XATO EMAS ──
 * Server limitdan oshgan summani 202 bilan qaytaradi: hujjat
 * yaratilmadi, tasdiq so'rovi ochildi. Buni muvaffaqiyat deb
 * ko'rsatish ham, xato deb ko'rsatish ham yolg'on bo'lardi —
 * shuning uchun xabar ALOHIDA va oqim `onSuccess` ga status bilan
 * yetkaziladi.
 */
export const useCreateExpenseMutation = (opts = {}) => {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (body) => expensesAPI.create(body),
    onSuccess: (res, ...rest) => {
      invalidate();
      opts.onSuccess?.(
        { pendingApproval: res?.status === 202, data: res?.data?.data },
        ...rest,
      );
    },
    onError: (err, ...rest) => {
      opts.onError?.(err, ...rest);
    },
  });
};

/**
 * CHIQIMNI TAHRIRLASH.
 *
 * ── SERVER JURNALNI HAM YANGILAYDI ──
 * Summa, kanal, sana, filial yoki kategoriya o'zgarsa server eski
 * jurnal yozuvini STORNO qilib, yangi qiymatlar bilan qaytadan
 * yozadi (bitta tranzaksiyada). Ya'ni tahrir kassa qoldig'ini ham
 * o'zgartiradi — shuning uchun keshni bekor qilish `create` bilan
 * AYNAN BIR XIL keng bo'ladi.
 *
 * ⚠ TASDIQDAN o'tgan chiqimning SUMMASI o'zgartirilmaydi (server
 * 400 qaytaradi): aks holda 100 mln so'rab, 1 mln tasdiqlatib,
 * keyin yana 100 mln qilish limitni aylanib o'tish yo'li bo'lardi.
 */
export const useUpdateExpenseMutation = (opts = {}) => {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      expensesAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, ...rest) => {
      invalidate();
      opts.onSuccess?.(data, ...rest);
    },
    onError: (err, ...rest) => {
      opts.onError?.(err, ...rest);
    },
  });
};

/** Chek yuklash. Chiqim saqlanishidan OLDIN chaqiriladi. */
export const useUploadReceiptMutation = (opts = {}) =>
  useMutation({
    mutationFn: (file) => expensesAPI.uploadReceipt(file).then((r) => r.data.data),
    onError: (err) =>
      toast.error(err?.response?.data?.message || "Chekni yuklab bo'lmadi"),
    ...opts,
  });

export const useDeleteExpenseMutation = () => {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (id) => expensesAPI.remove(id),
    onSuccess: () => {
      // "Bekor qilindi", "o'chirildi" EMAS: server yozuvni
      // yo'qotmaydi — `isDeleted` qo'yadi va jurnalni STORNO qiladi.
      // Ikkala amal ham tarixda ko'rinib turadi.
      toast.success("Chiqim bekor qilindi", {
        description: "Jurnal storno qilindi, kassa qoldig'i tiklandi.",
      });
      invalidate();
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || "Chiqimni o'chirib bo'lmadi"),
  });
};

export { useInvalidateExpenses };
