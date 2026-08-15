import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { branchAnalyticsAPI } from "../api/branchAnalytics.api";

export const usePnlQuery = (params = {}) =>
  useQuery({
    queryKey: qk.branchAnalytics.pnl(params),
    queryFn: () => branchAnalyticsAPI.pnl(params).then((r) => r.data.data),
  });

export const useNormalizedQuery = (params = {}) =>
  useQuery({
    queryKey: qk.branchAnalytics.normalized(params),
    queryFn: () => branchAnalyticsAPI.normalized(params).then((r) => r.data.data),
  });

export const useUtilizationQuery = () =>
  useQuery({
    queryKey: qk.branchAnalytics.utilization(),
    queryFn: () => branchAnalyticsAPI.utilization().then((r) => r.data.data),
  });

export const useChurnQuery = (params = {}) =>
  useQuery({
    queryKey: qk.branchAnalytics.churn(params),
    queryFn: () => branchAnalyticsAPI.churn(params).then((r) => r.data.data),
  });

// Alertlar tez-tez yangilanadi - ular "hozir nima noto'g'ri" savoliga
// javob beradi va eskirgan javob foydasiz.
export const useAlertsQuery = () =>
  useQuery({
    queryKey: qk.branchAnalytics.alerts(),
    queryFn: () => branchAnalyticsAPI.alerts().then((r) => r.data.data),
    refetchInterval: 60_000,
  });
