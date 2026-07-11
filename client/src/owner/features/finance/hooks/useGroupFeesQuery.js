import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useGroupFeesQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.groupFees(params),
    queryFn: () => financeAPI.groupFees(params).then((r) => r.data.data),
    enabled: !!params?.year && !!params?.month,
    ...options,
  });

export default useGroupFeesQuery;
