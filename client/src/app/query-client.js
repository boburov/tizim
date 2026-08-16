import { QueryClient, QueryCache } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

const DEFAULT_STALE_TIME = 5 * 60 * 1000;
const DEFAULT_GC_TIME = 15 * 60 * 1000;

const queryClient = new QueryClient({
  // Query xatolari komponentda qo'lda ushlanmasa ham foydalanuvchiga ko'rsatiladi.
  //
  // IKKI ISTISNO - ikkalasi ham "bu xato EMAS yoki boshqa joyda
  // ko'rsatilgan" degan sababga tayanadi:
  //
  //   401 - sessiya. Interceptor refresh/redirect qiladi; bu yerda
  //         toast chiqarilsa foydalanuvchi login sahifasiga o'tayotib
  //         keraksiz qizil xabar ko'rardi.
  //
  //   501 MODULE_NOT_MIGRATED - "bu bo'lim hali PostgreSQL'ga
  //         ko'chirilmagan" (server: config/legacyMongoose.js). Bu
  //         KUTILGAN holat, nosozlik emas. Dashboard komponentlari uni
  //         allaqachon xotirjam "Manba ulanmagan" bloki bilan
  //         ko'rsatadi (shared/components/dashboard/DataState.jsx).
  //
  //         Ustiga QIZIL TOAST chiqarilsa ikki muammo tug'ilardi:
  //           • bir holat IKKI joyda, ikki xil ohangda ko'rsatilardi -
  //             biri xotirjam, biri xavotirli;
  //           • rahbariyat paneli har ochilganda "xatolik" xabari
  //             chiqib, ishlab turgan tizim buzuqdek ko'rinardi.
  queryCache: new QueryCache({
    onError: (error) => {
      const status = error?.response?.status;
      if (status === 401) return;
      if (status === 501) return;
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
