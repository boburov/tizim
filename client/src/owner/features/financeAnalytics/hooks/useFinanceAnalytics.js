import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAnalyticsAPI } from "../api/financeAnalytics.api";

/**
 * TAHLIL SO'ROVLARI.
 *
 * ── `enabled` NEGA MUHIM ──
 * Chuqur bo'limlar (foydalilik, pul oqimi) faqat O'SHA tab ochilganda
 * so'raladi. Sahifa yuklanishida 22 ta endpoint'ni birdan chaqirish
 * serverni ham, brauzerni ham bo'g'ib qo'yardi — talab ham buni
 * ochiq taqiqlaydi ("Do not call every endpoint simultaneously").
 *
 * ── `staleTime` ──
 * Moliyaviy tahlil har soniyada o'zgarmaydi. 60 soniya — tab
 * almashtirilganda takroriy so'rov bo'lmasligi uchun yetarli, lekin
 * yangi to'lov kiritilgach `invalidate` baribir darhol yangilaydi.
 */
const DEFAULTS = { staleTime: 60_000, retry: 1 };

const make = (keyFn, apiFn) => (filters, opts = {}) =>
  useQuery({
    queryKey: keyFn(filters),
    queryFn: () => apiFn(filters).then((r) => r.data.data),
    ...DEFAULTS,
    ...opts,
  });

export const useSummary = make(qk.financeAnalytics.summary, financeAnalyticsAPI.summary);
export const useAlerts = make(qk.financeAnalytics.alerts, financeAnalyticsAPI.alerts);

export const useRevenueTrend = make(qk.financeAnalytics.revenueTrend, financeAnalyticsAPI.revenueTrend);
export const usePaymentMethods = make(qk.financeAnalytics.paymentMethods, financeAnalyticsAPI.paymentMethods);
export const useRefundAnalytics = make(qk.financeAnalytics.refunds, financeAnalyticsAPI.refunds);
export const useDiscountAnalytics = make(qk.financeAnalytics.discounts, financeAnalyticsAPI.discounts);

export const useExpenseTrend = make(qk.financeAnalytics.expenseTrend, financeAnalyticsAPI.expenseTrend);
export const useExpenseBreakdown = make(qk.financeAnalytics.expenseBreakdown, financeAnalyticsAPI.expenseBreakdown);
export const useCostStructure = make(qk.financeAnalytics.costStructure, financeAnalyticsAPI.costStructure);
export const useRecurringSplit = make(qk.financeAnalytics.recurring, financeAnalyticsAPI.recurring);
export const useBudget = make(qk.financeAnalytics.budget, financeAnalyticsAPI.budget);

export const useCashFlow = make(qk.financeAnalytics.cashFlow, financeAnalyticsAPI.cashFlow);
export const useAccounts = make(qk.financeAnalytics.accounts, financeAnalyticsAPI.accounts);
export const useCashTrend = make(qk.financeAnalytics.cashTrend, financeAnalyticsAPI.cashTrend);

export const useReceivables = make(qk.financeAnalytics.receivables, financeAnalyticsAPI.receivables);

export const useTeacherProfit = make(qk.financeAnalytics.teachers, financeAnalyticsAPI.teachers);
export const useDirectionProfit = make(qk.financeAnalytics.directions, financeAnalyticsAPI.directions);
export const useGroupProfit = make(qk.financeAnalytics.groups, financeAnalyticsAPI.groups);
export const useRoomRevenue = make(qk.financeAnalytics.rooms, financeAnalyticsAPI.rooms);
export const useBranchProfit = make(qk.financeAnalytics.branches, financeAnalyticsAPI.branches);

/** Kesimli so'rovlar — `by` parametri bilan. */
export const useRevenueBy = (by, filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.revenueBy(by, filters),
    queryFn: () => financeAnalyticsAPI.revenueBy(by, filters).then((r) => r.data.data),
    ...DEFAULTS,
    ...opts,
  });

export const useReceivablesBy = (by, filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.receivablesBy(by, filters),
    queryFn: () => financeAnalyticsAPI.receivablesBy(by, filters).then((r) => r.data.data),
    ...DEFAULTS,
    ...opts,
  });

/**
 * BITTA YOZUV TAFSILOTI — FAQAT SO'RALGANDA.
 *
 * `enabled: Boolean(id)` — panel yopiq turganda so'rov KETMAYDI.
 * Talab 14 aynan shu haqda: tafsilot sahifa yuklanishida emas,
 * foydalanuvchi qatorni bosganda olinadi.
 *
 * `staleTime: Infinity` — jurnal yozuvi O'ZGARMAS (tuzatish faqat
 * yangi storno yozuvi bilan). Shuning uchun bir marta olingan
 * tafsilotni qayta so'rashning ma'nosi yo'q.
 */
export const useEntryDetail = (id) =>
  useQuery({
    queryKey: qk.financeAnalytics.entry(id),
    queryFn: () => financeAnalyticsAPI.entry(id).then((r) => r.data.data),
    enabled: Boolean(id),
    staleTime: Infinity,
    retry: false,
  });

/**
 * YOZUVLAR RO'YXATI — drill-down zanjirining oxirgi bo'g'ini.
 *
 * Faqat panel ochilganda so'raladi (`enabled`), sahifa yuklanishida
 * emas: talab 14 minglab yozuvni oldindan olishni taqiqlaydi.
 */
export const useEntryList = (filters, opts = {}) =>
  useQuery({
    queryKey: qk.financeAnalytics.entries(filters),
    queryFn: () => financeAnalyticsAPI.entries(filters).then((r) => r.data.data),
    staleTime: 60_000,
    ...opts,
  });
