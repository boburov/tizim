import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const branchAnalyticsAPI = {
  pnl: (params) => http.get(ENDPOINTS.branchAnalytics.pnl, { params }),
  elimination: (params) => http.get(ENDPOINTS.branchAnalytics.elimination, { params }),
  normalized: (params) => http.get(ENDPOINTS.branchAnalytics.normalized, { params }),
  utilization: () => http.get(ENDPOINTS.branchAnalytics.utilization),
  churn: (params) => http.get(ENDPOINTS.branchAnalytics.churn, { params }),
  alerts: () => http.get(ENDPOINTS.branchAnalytics.alerts),
};
