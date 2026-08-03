// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Sonner
import { toast } from "sonner";

// Utils
import { apiErrorToast } from "@/shared/utils/apiError";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// API
import { teacherSalaryAPI } from "../api/teacherSalary.api";

// Stavka o'zgarishi MAOSH QATORLARINI qayta hisoblaydi, shuning uchun
// maosh ro'yxatlari ham invalidatsiya qilinadi - aks holda jadvalda eski
// summa turib qolardi.
const invalidateAll = (qc, teacherId) => {
  qc.invalidateQueries({ queryKey: qk.teacherSalary.compensations(teacherId) });
  qc.invalidateQueries({ queryKey: qk.teacherSalary.all() });
};

/**
 * Server 202 qaytarsa - amal BAJARILMADI, tasdiqqa yuborildi
 * (approvals.decide_config ruxsati yo'q foydalanuvchi). Buni jimgina
 * "saqlandi" deb ko'rsatish eng chalg'ituvchi holat bo'lardi.
 */
const successMessage = (res) => {
  if (res?.status === 202) {
    return res?.data?.message || "Tasdiqlash uchun yuborildi";
  }
  const locked = res?.data?.data?.recompute?.lockedRows || 0;
  if (locked > 0) {
    return `Maosh stavkasi saqlandi. ${locked} ta to'langan oy o'zgarmadi.`;
  }
  return "Maosh stavkasi saqlandi";
};

export const useSetCompensationMutation = (teacherId, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => teacherSalaryAPI.setCompensation(body),
    onSuccess: (res, vars, ctx) => {
      invalidateAll(qc, teacherId);
      toast.success(successMessage(res));
      options.onSuccess?.(res?.data?.data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useAmendCompensationMutation = (teacherId, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => teacherSalaryAPI.amendCompensation(id, body),
    onSuccess: (res, vars, ctx) => {
      invalidateAll(qc, teacherId);
      toast.success(successMessage(res));
      options.onSuccess?.(res?.data?.data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useRemoveCompensationMutation = (teacherId, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => teacherSalaryAPI.removeCompensation(id),
    onSuccess: (res, vars, ctx) => {
      invalidateAll(qc, teacherId);
      toast.success("Maosh stavkasi o'chirildi");
      options.onSuccess?.(res, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
