import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useGroupFeesByGroupQuery = (groupId, options = {}) =>
  useQuery({
    queryKey: qk.finance.groupFeesByGroup(groupId),
    queryFn: () => financeAPI.groupFeesByGroup(groupId).then((r) => r.data.data),
    enabled: !!groupId,
    ...options,
  });

export default useGroupFeesByGroupQuery;
