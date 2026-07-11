// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { teacherGroupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useMyGroupsQuery = () =>
  useQuery({
    queryKey: qk.groups.myTeach(),
    queryFn: () => teacherGroupsAPI.myTeach().then((r) => r.data.data),
  });

export default useMyGroupsQuery;
