// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupHistoryQuery = (id, params) =>
  useQuery({
    queryKey: qk.groups.history(id, params),
    queryFn: () => groupsAPI.history(id, params).then((r) => r.data),
    enabled: !!id,
  });

export default useGroupHistoryQuery;
