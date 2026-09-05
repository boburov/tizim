import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

/** Audit sahifasining "Moliya" tab'i — `FinancialAuditLog`. */
const useFinancialAuditQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.activityLogs.financial(params),
    queryFn: () => activityLogsAPI.financial(params).then((r) => r.data),
    ...options,
  });

export default useFinancialAuditQuery;
