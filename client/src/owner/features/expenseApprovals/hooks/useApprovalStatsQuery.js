import { useQuery } from "@tanstack/react-query";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";
import { POLL_MS } from "../constants";

// KPI kartalari uchun yig'ma. Ro'yxat bilan bir xil ritmda yangilanadi -
// aks holda karta "12 kutilmoqda" deb turib jadval 11 tani ko'rsatardi.
const useApprovalStatsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.expenseApprovals.stats(),
    queryFn: () => expenseApprovalsAPI.stats().then((r) => r.data.data),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    ...options,
  });

export default useApprovalStatsQuery;
