import { useQuery } from "@tanstack/react-query";
import { usersAPI } from "../api/users.api";
import { qk } from "@/shared/lib/query/keys";

const useUserGroupHistoryQuery = (id, params) =>
  useQuery({
    queryKey: qk.users.groupHistory(id, params),
    queryFn: () => usersAPI.groupHistory(id, params).then((r) => r.data),
    enabled: !!id,
  });

export default useUserGroupHistoryQuery;
