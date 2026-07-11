import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useStudentPaymentHistoryQuery = (studentId, options = {}) =>
  useQuery({
    queryKey: qk.finance.studentHistory(studentId),
    queryFn: () =>
      financeAPI.studentPaymentHistory(studentId).then((r) => r.data.data),
    enabled: !!studentId,
    ...options,
  });

export default useStudentPaymentHistoryQuery;
