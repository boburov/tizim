import { useQuery } from "@tanstack/react-query";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";

// Sidebar belgisi uchun - kutilayotgan so'rovlar soni.
const usePendingApprovalsCount = (options = {}) =>
  useQuery({
    queryKey: qk.expenseApprovals.pendingCount(),
    queryFn: () => expenseApprovalsAPI.pendingCount().then((r) => r.data.data.count),
    staleTime: 60 * 1000,
    ...options,
  });

export default usePendingApprovalsCount;
