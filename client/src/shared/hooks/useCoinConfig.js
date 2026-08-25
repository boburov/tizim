// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Hooks
import useAuth from "@/shared/hooks/useAuth";

/**
 * ══════════════════════════════════════════════════════════════════════
 * TANGA BO'LIMINING O'CHIRGICHI — KLIENT TOMONI
 * ══════════════════════════════════════════════════════════════════════
 *
 * Ega bo'limni o'chirsa u HAMMA uchun yo'qolishi kerak: menyu yozuvi
 * ham, marshrut ham, tugma ham. Bu hook shu qarorning YAGONA manbai.
 *
 * ── NEGA RUXSAT YETARLI EMAS ──
 * `has(PERMISSIONS.MARKET_MANAGE)` "menda huquq bor" deydi, xolos.
 * O'chirilgan bo'limda huquq baribir qoladi (u rolda saqlanadi), lekin
 * server 404 qaytaradi. Faqat ruxsatga tayanilsa administrator
 * "Market" ni ko'rar, bosar va bo'sh xato ekraniga tushardi.
 *
 * ── NEGA `enabled: false` XATO EMAS ──
 * `/coins/config` bo'lim o'chirilganda HAM 200 qaytaradi. Bu ataylab:
 * "o'chirilgan" — bu ma'lumot, xato emas. 404 qaytarilsa klient uni
 * tarmoq nosozligidan ajrata olmasdi va menyu tasodifiy paydo bo'lib
 * yo'qolib turardi.
 *
 * ── XATO HOLATIDA YOPIQ ──
 * So'rov yiqilsa `enabled: false` qaytariladi. Ochiq qoldirish
 * "bo'lim bor" deb ko'rsatib, keyin har bosishda xato berardi;
 * yopiq holat esa eng yomon holatda bitta yozuvni vaqtincha
 * yashiradi.
 */
const FALLBACK = Object.freeze({
  enabled: false,
  marketEnabled: false,
  coinLabel: "tanga",
  earn: null,
});

const useCoinConfig = () => {
  const { role } = useAuth();

  const { data, isLoading, isError } = useQuery({
    queryKey: qk.coinConfig.all(),
    queryFn: () => http.get(ENDPOINTS.coins.config).then((r) => r.data.data),
    // Login qilmagan foydalanuvchi uchun so'rov yubormaymiz — u
    // baribir 401 olardi va `AuthGuard` uni login sahifasiga
    // olib chiqadi.
    enabled: Boolean(role),
    // O'chirgich kunda bir marta ham bosilmaydi — har navigatsiyada
    // qayta so'rash ma'nosiz. 5 daqiqa serverdagi keshdan (30 s)
    // uzunroq, ya'ni klient hech qachon serverdan "yangiroq" bo'lib
    // qolmaydi.
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const config = data || FALLBACK;

  return {
    ...config,
    /** Tanga bo'limi umuman ochiqmi. */
    enabled: Boolean(config.enabled),
    /** Do'kon ochiqmi (asosiy o'chirgich + market o'chirgichi). */
    marketEnabled: Boolean(config.marketEnabled),
    /** Interfeysdagi nom — "tanga", "ball", "yulduz"... */
    coinLabel: config.coinLabel || "tanga",
    isLoading,
    isError,
  };
};

export default useCoinConfig;
