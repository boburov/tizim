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

/**
 * Xato ROSTDAN HAM autentifikatsiya xatosimi (401/403)?
 *
 * Farq muhim: sessiya faqat shu ikki holatda tugagan hisoblanadi. Tarmoq
 * uzilishi yoki server xatosi (5xx) esa VAQTINCHALIK - foydalanuvchini
 * chiqarib yuborish uchun asos emas. Telegram mini ilovada bu ayniqsa
 * seziladi: WebView so'rovni sahifa ochilishi bilan yuboradi va birinchi
 * urinish brauzerdagiga qaraganda ancha ko'p yiqiladi.
 */
export const isAuthFailure = (error) => {
  const status = error?.response?.status;
  return status === 401 || status === 403;
};

const useAuth = () => {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("authToken") : null;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: qk.auth.me(),
    queryFn: fetchMe,
    enabled: !!token,
    // 401/403 - qayta urinish ma'nosiz (sessiya tugagan). Qolgan hamma
    // narsa (tarmoq, 5xx) 2 marta qayta uriniladi: WebView'dagi bitta
    // tasodifiy uzilish sessiyani yo'q qilmasligi kerak.
    retry: (failureCount, err) => !isAuthFailure(err) && failureCount < 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
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
    /**
     * ══════════════════════════════════════════════════════════════════
     * FILIALLI TARIF YOQILGANMI (`BRANCHES_ENABLED` / heartbeat)
     * ══════════════════════════════════════════════════════════════════
     *
     * ⚠ `multiBranch` DAN BOSHQA NARSA. Ularni aralashtirish oson va
     * natijasi jimgina buzuq bo'ladi:
     *   • `multiBranch` — bazada FAOL FILIAL SONI > 1 (fakt);
     *   • `branchesEnabled` — filialli rejim SOTIB OLINGANMI (tarif).
     *
     * Panel ajratish AYNAN tarifga bog'lanadi. Agar `multiBranch` ga
     * bog'lansa: "ko'p filialli tarif olingan, lekin hali bitta filial"
     * holatida ega admin panelda qolardi, ikkinchi filial ochilgan
     * kuni esa KUTILMAGANDA `/org` ga ko'chib qolardi.
     *
     * ⚠ STANDART `false` — YOPIQ. `multiBranch` da ochiq standart
     * to'g'ri edi (u faqat menyuni boyitardi), bu yerda esa ochiq
     * standart `/org` ni mavjud qilib, egani `/owner` dan QUVIB
     * CHIQARARDI. Ya'ni ma'lumot kelmaguncha eng buzuq xulq.
     * Yopiq standartda hamma `/owner` da qoladi — hech kim hech
     * qayerdan quvilmaydi.
     */
    branchesEnabled: data?.branchLimits?.branchesEnabled === true,
    /**
     * Serverning ISH MAKONI qarori (`workspace-resolve.ts`).
     *
     * `useWorkspace` klientdagi hisobdan OLDIN shuni oladi: qoida
     * ikki joyda takrorlangan va ular vaqt o'tib ajralib ketishi
     * mumkin. Eski backend bu maydonni yubormaydi — o'shanda klient
     * o'z hisobiga qaytadi (`undefined` → fallback).
     */
    workspace: data?.workspace || null,
    workspaceHome: data?.home || null,
    // Markazdagi jami filial. Yakka rejim yoqilgan-u, bu 1 dan katta bo'lsa -
    // hisobotlar faqat asosiy filialni qamraydi (ogohlantirish chizig'i).
    branchCount: data?.branchCount ?? 0,
    isOwner: roleType === ROLES.OWNER,
    isAuthenticated: !!data?.user,
    isLoading: !!token && isLoading,
    isError,
    error,
    // Sessiya tugagan (401/403) - faqat shunda logout qilinadi.
    isSessionExpired: isError && isAuthFailure(error),
    refetch,
  };
};

export default useAuth;
