// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { studentGroupAPI } from "../api/group.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useMyGroupQuery = () =>
  useQuery({
    queryKey: qk.groups.myActive(),
    queryFn: () => studentGroupAPI.myActive().then((r) => r.data.data),
  });

export default useMyGroupQuery;
