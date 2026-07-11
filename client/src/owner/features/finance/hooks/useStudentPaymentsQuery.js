import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useStudentPaymentsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.studentPayments(params),
    queryFn: () => financeAPI.studentPayments(params).then((r) => r.data),
    ...options,
  });

export default useStudentPaymentsQuery;
