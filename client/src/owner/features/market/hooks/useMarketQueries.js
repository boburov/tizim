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
 * ⚠ HAR BIR SO'ROV O'CHIRGICH OSTIDA (`enabled: config.enabled`).
 *
 * Bo'lim o'chirilganda server 404 qaytaradi. So'rov baribir
 * yuborilsa TanStack uni XATO deb belgilaydi va sahifada "xatolik
 * yuz berdi" chiqardi — holbuki hech qanday xato yo'q, bo'lim
 * shunchaki o'chirilgan. Shuning uchun so'rov UMUMAN yuborilmaydi.
 */
export const useMarketProductsQuery = (params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.market.products(params),
    queryFn: () => marketAPI.products(params).then((r) => r.data),
    enabled,
  });
};

export const useMarketOrdersQuery = (params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.market.orders(params),
    queryFn: () => marketAPI.orders(params).then((r) => r.data),
    enabled,
  });
};

/**
 * IQTISODIYOT HOLATI: sarlavha raqami + oqim grafigi + manba kesimi.
 *
 * ⚠ `days` KESH KALITINING BIR QISMI. Bo'lmasa 14 kunlik javob
 * 90 kunlik so'rovga ham qaytarilardi va grafik davr almashtirilganda
 * o'zgarmay turardi — foydalanuvchi buni "tugma ishlamayapti" deb
 * o'qirdi.
 */
export const useCoinStatsQuery = (days = 30) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.coins.stats(days),
    queryFn: () => coinsAPI.stats({ days }).then((r) => r.data.data),
    enabled,
    // Davr almashtirilganda oldingi javob ekranda qoladi (bo'sh
    // holatga sakramaydi) va yangisi kelgach almashadi.
    placeholderData: (prev) => prev,
  });
};

/**
 * SOZLAMALAR — `enabled` SHARTI ATAYLAB YO'Q.
 *
 * Bu yagona so'rov bo'lim O'CHIRILGANDA ham ishlashi kerak: aks holda
 * ega uni qayta yoqadigan formani UMUMAN ko'ra olmasdi (server ham
 * shu marshrutni o'chirgichdan ozod qilgan — `BypassCoinSwitch`).
 */
export const useCoinSettingsQuery = () =>
  useQuery({
    queryKey: qk.coins.settings(),
    queryFn: () => coinsAPI.settings().then((r) => r.data.data),
  });

/** Bitta foydalanuvchining hamyoni va tarixi (admin ko'rinishi). */
export const useUserWalletQuery = (userId, params) => {
  const { enabled } = useCoinConfig();
  return useQuery({
    queryKey: qk.coins.userWallet(userId, params),
    queryFn: () => coinsAPI.userWallet(userId, params).then((r) => r.data),
    enabled: enabled && Boolean(userId),
  });
};
