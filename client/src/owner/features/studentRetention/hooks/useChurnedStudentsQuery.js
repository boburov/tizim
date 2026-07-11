import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { retentionAPI } from "../api/retention.api";

// enabled: modal ochilgandagina so'rov yuboriladi (kartaga bosmaguncha emas).
const useChurnedStudentsQuery = (params, { enabled = true } = {}) =>
  useQuery({
    queryKey: qk.adminDashboard.churnedStudents(params),
    queryFn: () => retentionAPI.churnedStudents(params).then((r) => r.data.data),
    enabled,
  });

export default useChurnedStudentsQuery;
