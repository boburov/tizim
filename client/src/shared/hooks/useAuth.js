// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Constants
import { ROLES } from "@/shared/constants/roles";

const fetchMe = () => http.get(ENDPOINTS.auth.me).then((r) => r.data.data);

const useAuth = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.auth.me(),
    queryFn: fetchMe,
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const role = data?.role || data?.user?.role || null;

  return {
    user: data?.user || null,
    role,
    permissions: data?.permissions || [],
    isOwner: role === ROLES.OWNER,
    isAuthenticated: !!data?.user,
    isLoading: !!token && isLoading,
    isError,
    refetch,
  };
};

export default useAuth;
