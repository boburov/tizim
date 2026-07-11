// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { teacherGroupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupQuery = (id) =>
  useQuery({
    queryKey: qk.groups.one(id),
    queryFn: () => teacherGroupsAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
  });

export default useGroupQuery;
