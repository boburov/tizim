import { useQuery } from "@tanstack/react-query";
import { branchesAPI } from "../api/branches.api";
import { qk } from "@/shared/lib/query/keys";

const useBranchesQuery = (params) =>
  useQuery({
    queryKey: qk.branches.list(params),
    queryFn: () => branchesAPI.list(params).then((r) => r.data),
  });

export default useBranchesQuery;
