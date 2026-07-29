import { useQuery } from "@tanstack/react-query";
import { branchesAPI } from "../api/branches.api";
import { qk } from "@/shared/lib/query/keys";

// Barcha filiallar yonma-yon. Global BranchPicker BITTA filialga qisadi,
// shuning uchun taqqoslash uchun alohida endpoint kerak.
const useBranchCompareQuery = (options = {}) =>
  useQuery({
    queryKey: qk.branches.compare(),
    queryFn: () => branchesAPI.compare().then((r) => r.data.data),
    ...options,
  });

export default useBranchCompareQuery;
