// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { authAPI } from "../api/auth.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useMeQuery = (options = {}) =>
  useQuery({
    queryKey: qk.auth.me(),
    queryFn: () => authAPI.me().then((r) => r.data.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  });

export default useMeQuery;
