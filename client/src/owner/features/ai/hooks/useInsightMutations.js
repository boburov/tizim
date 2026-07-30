import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { aiAPI } from "../api/ai.api";

// Insight holati o'zgargach barcha insight ro'yxatlari eskiradi:
// Action Center, modul panellari va badge'lar bir xil ma'lumotni ko'rsatadi.
// qk.ai.insights() prefiksi uchalasini ham qamrab oladi.
const invalidate = (qc) => qc.invalidateQueries({ queryKey: qk.ai.insights() });

export const useAckInsightMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => aiAPI.acknowledge(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Ko'rildi deb belgilandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useResolveInsightMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => aiAPI.resolve(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Bajarildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

/**
 * "Bu noto'g'ri" - modelni kalibrlash uchun ENG QIMMATLI signal, shuning
 * uchun server sababni MAJBURIY qiladi. UI ham shuni aks ettiradi:
 * sababsiz rad etish tugmasi yo'q.
 */
export const useDismissInsightMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }) => aiAPI.dismiss(id, reason).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Rad etildi — izohingiz modelni yaxshilashga yordam beradi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useRecomputeMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (branchId) => aiAPI.recompute(branchId).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate(qc);
      toast.success("Qayta hisoblandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
