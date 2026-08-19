import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAnalyticsAPI } from "../api/financeAnalytics.api";

/**
 * MOLIYAVIY INTELLEKT SO'ROVLARI.
 *
 * ── LLM DASHBOARD OCHILISHIDA CHAQIRILMAYDI ──
 * `useIntelligence` va `useBriefing` FAQAT determinstik qoidalarni
 * oladi — serverda ular tahlil natijasidan hisoblanadi va birorta
 * model chaqirilmaydi.
 *
 * AI izohi alohida: `useSignalDetail(id, { explain: true })` va u
 * faqat foydalanuvchi "Nega bunday?" tugmasini bosganda ishga
 * tushadi (talab O).
 */
const DEFAULTS = { staleTime: 60_000, retry: 1 };

export const useIntelligence = (filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.intelligence(filters),
    queryFn: () => financeAnalyticsAPI.intelligence(filters).then((r) => r.data.data),
    ...DEFAULTS,
    ...opts,
  });

export const useBriefing = (filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.briefing(filters),
    queryFn: () => financeAnalyticsAPI.briefing(filters).then((r) => r.data.data),
    ...DEFAULTS,
    ...opts,
  });

/**
 * Bitta signal tafsiloti.
 *
 * `explain` — AI izohini so'raydimi. Server keshlaydi, shuning uchun
 * takroriy ochishda yangi LLM chaqiruvi bo'lmaydi.
 */
export const useSignalDetail = (signalId, filters, { explain = false, ...opts } = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.signal(signalId, filters, explain),
    queryFn: () =>
      financeAnalyticsAPI
        .signal(signalId, { ...filters, explain: explain ? "true" : undefined })
        .then((r) => r.data.data),
    enabled: Boolean(signalId),
    // AI javobi keshlangan — qayta so'rash shart emas.
    staleTime: explain ? Infinity : 60_000,
    retry: false,
    ...opts,
  });
