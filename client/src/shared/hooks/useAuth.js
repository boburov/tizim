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
  // Serverdan keladigan rol metadata (custom rollar uchun). Rol nomi
  // hardcode qilinmasin: landing sahifa va scope tipi shu yerdan olinadi.
  const roleMeta = data?.roleMeta || null;
  const roleType = roleMeta?.roleType || role;

  return {
    user: data?.user || null,
    role,
    roleMeta,
    // "Xatti-harakat tipi": custom "Katta o'qituvchi" roli ham teacher.
    roleType,
    roleLabel: roleMeta?.label || null,
    // Login'dan keyin tushadigan sahifa (ROLE_HOME o'rniga).
    homePath: roleMeta?.defaultPath || null,
    permissions: data?.permissions || [],
    // FILIAL: foydalanuvchi kira oladigan filiallar (tanlagich shundan quriladi).
    branches: data?.branches || [],
    canSeeAllBranches: !!data?.canSeeAllBranches,
    homeBranchId: data?.homeBranchId || null,
    // KO'P FILIALLI REJIM (server env, MULTI_BRANCH). false bo'lsa filial
    // tushunchasi UI'da umuman ko'rinmaydi. Server yubormasa - true
    // (eski backend bilan ishlayotgan client o'zgarishsiz qoladi).
    multiBranch: data?.multiBranch !== false,
    // Markazdagi jami filial. Yakka rejim yoqilgan-u, bu 1 dan katta bo'lsa -
    // hisobotlar faqat asosiy filialni qamraydi (ogohlantirish chizig'i).
    branchCount: data?.branchCount ?? 0,
    isOwner: roleType === ROLES.OWNER,
    isAuthenticated: !!data?.user,
    isLoading: !!token && isLoading,
    isError,
    refetch,
  };
};

export default useAuth;
