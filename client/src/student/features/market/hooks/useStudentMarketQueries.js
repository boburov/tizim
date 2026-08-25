// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { marketAPI } from "@/shared/api/market.api";
import { coinsAPI } from "@/shared/api/coins.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Hooks
import useCoinConfig from "@/shared/hooks/useCoinConfig";

/**
 * ⚠ HAMMA SO'ROV O'CHIRGICH OSTIDA.
 *
 * Bo'lim o'chirilganda server 404 beradi va TanStack uni xato deb
 * belgilardi — o'quvchi "tizim buzuq" degan ekranni ko'rardi.
 * O'chirilgan bo'lim esa xato emas: sahifa umuman ochilmaydi
 * (`CoinGuard`), so'rov ham yuborilmaydi.
 *
 * ── KATALOG UCHUN `marketEnabled`, QOLGANI UCHUN `enabled` ──
 * Ega faqat do'konni yopishi mumkin (mahsulot ro'yxatini
 * yangilayotganda). O'shanda o'quvchi hamyonini va tarixini
 * KO'RISHDA DAVOM ETADI — tanga to'planishi to'xtamaydi.
 */
export const useMarketCatalogQuery = (params) => {
  const { marketEnabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.market.catalog(params),
    queryFn: () => marketAPI.catalog(params).then((r) => r.data),
    enabled: marketEnabled,
  });
};

export const useMyOrdersQuery = (params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.market.myOrders(params),
    queryFn: () => marketAPI.myOrders(params).then((r) => r.data),
    enabled,
  });
};

/** O'z hamyonim: balans, jami topilgan/sarflangan, bugungi hisob. */
export const useMyCoinsQuery = () => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.coins.me(),
    queryFn: () => coinsAPI.me().then((r) => r.data.data),
    enabled,
  });
};

export const useMyCoinHistoryQuery = (params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.coins.myHistory(params),
    queryFn: () => coinsAPI.myHistory(params).then((r) => r.data),
    enabled,
  });
};

/** Reyting — server uni O'Z FILIALI bilan cheklaydi. */
export const useCoinLeaderboardQuery = (params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.coins.leaderboard(params),
    queryFn: () => coinsAPI.leaderboard(params).then((r) => r.data.data),
    enabled,
  });
};
