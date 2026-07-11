import { useQuery } from "@tanstack/react-query";
import { usersAPI } from "../api/users.api";
import { qk } from "@/shared/lib/query/keys";

const useUserDetailQuery = (id) =>
  useQuery({
    queryKey: qk.users.one(id),
    queryFn: () => usersAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
  });

export default useUserDetailQuery;
