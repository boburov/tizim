// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.groups.one(id),
    queryFn: () => groupsAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export default useGroupQuery;
