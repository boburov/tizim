import { useQuery } from "@tanstack/react-query";
import { branchesAPI } from "../api/branches.api";
import { qk } from "@/shared/lib/query/keys";

const useBranchStatsQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.branches.stats(id),
    queryFn: () => branchesAPI.stats(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export default useBranchStatsQuery;
