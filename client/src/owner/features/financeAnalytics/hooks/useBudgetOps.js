import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { financeOpsAPI } from "../api/financeAnalytics.api";

/**
 * BYUDJET BOSHQARUVI.
 *
 * ── NEGA FAQAT BYUDJET SO'ROVLARI BEKOR QILINADI ──
 * Byudjet REJA — u jurnalga yozilmaydi va daromad/xarajat/qoldiq
 * raqamlariga TA'SIR QILMAYDI. Shuning uchun butun `financeAnalytics`
 * daraxtini bekor qilish keraksiz ish bo'lardi: 20 dan ortiq so'rov
 * bekorga qayta yuklanardi.
 *
 * Bekor qilinadigan yagona narsa — byudjet ro'yxati va `budget`
 * tahlili (u reja bilan faktni taqqoslaydi).
 */
const useInvalidateBudget = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["financeAnalytics", "budget"] });
    qc.invalidateQueries({ queryKey: ["financeAnalytics", "budgets"] });
    qc.invalidateQueries({ queryKey: ["financeAnalytics", "budgetOne"] });
  };
};

export const useBudgetList = (filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.budgets(filters),
    queryFn: () => financeOpsAPI.budgets(filters).then((r) => r.data.data),
    staleTime: 60_000,
    ...opts,
  });

const useBudgetMutation = (fn, successText) => {
  const invalidate = useInvalidateBudget();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { toast.success(successText); invalidate(); },
    onError: (err) => {
      toast.error(err?.response?.data?.message || "Amal bajarilmadi");
    },
  });
};

export const useCreateBudget = () =>
  useBudgetMutation(financeOpsAPI.createBudget, "Byudjet yaratildi");
export const useUpdateBudget = () =>
  useBudgetMutation(({ id, ...body }) => financeOpsAPI.updateBudget(id, body), "Byudjet saqlandi");
export const useRemoveBudget = () =>
  useBudgetMutation((id) => financeOpsAPI.removeBudget(id), "Byudjet o'chirildi");
