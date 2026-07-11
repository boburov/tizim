import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useStudentPaymentQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.finance.studentPayment(id),
    queryFn: () => financeAPI.studentPayment(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export default useStudentPaymentQuery;
