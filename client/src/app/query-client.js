import { QueryClient, QueryCache } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_GC_TIME = 15 * 60 * 1000;

const queryClient = new QueryClient({
  // Query xatolari komponentda qo'lda ushlanmasa ham foydalanuvchiga ko'rsatiladi.
  // 401 (sessiya) interceptor tomonidan boshqariladi - bu yerda qayta toast
  // chiqarmaymiz (refresh/redirect o'z ishini qiladi).
  queryCache: new QueryCache({
    onError: (error) => {
      if (error?.response?.status === 401) return;
      apiErrorToast(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_STALE_TIME,
      gcTime: DEFAULT_GC_TIME,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
});

export default queryClient;
