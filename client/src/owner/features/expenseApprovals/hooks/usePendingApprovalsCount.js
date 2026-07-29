import { useQuery } from "@tanstack/react-query";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";
import { POLL_MS } from "../constants";

// Sidebar belgisi va bildirishnoma oqimi uchun - kutilayotgan so'rovlar soni.
//
// REALTIME: loyihada socket/SSE yo'q, shuning uchun tizim bildirishnomalari
// bilan bir xil usul - polling (useSystemNotifications ham aynan shunday).
// `refetchIntervalInBackground: false` - tab orqada turganda so'rov
// yuborilmaydi, ya'ni ochiq qolgan panel serverni bekorga urmaydi.
const usePendingApprovalsCount = (options = {}) =>
  useQuery({
    queryKey: qk.expenseApprovals.pendingCount(),
    queryFn: () => expenseApprovalsAPI.pendingCount().then((r) => r.data.data.count),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: POLL_MS / 2,
    ...options,
  });

export default usePendingApprovalsCount;
