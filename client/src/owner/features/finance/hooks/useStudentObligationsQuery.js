import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useStudentObligationsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.studentObligations(params),
    queryFn: () => financeAPI.studentObligations(params).then((r) => r.data.data),
    enabled: !!params?.year,
    ...options,
  });

export default useStudentObligationsQuery;
