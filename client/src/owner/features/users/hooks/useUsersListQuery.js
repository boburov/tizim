// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { usersAPI } from "../api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useUsersListQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.users.list(params),
    queryFn: () => usersAPI.list(params).then((r) => r.data),
    ...options,
  });

export default useUsersListQuery;
