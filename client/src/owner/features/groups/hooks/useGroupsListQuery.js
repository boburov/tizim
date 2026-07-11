// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupsListQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.groups.list(params),
    queryFn: () => groupsAPI.list(params).then((r) => r.data),
    ...options,
  });

export default useGroupsListQuery;
