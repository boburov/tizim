import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

/** Audit sahifasining "Oylik" tab'i — `PayrollAuditLog`. */
const usePayrollAuditQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.activityLogs.payroll(params),
    queryFn: () => activityLogsAPI.payroll(params).then((r) => r.data),
    ...options,
  });

export default usePayrollAuditQuery;
