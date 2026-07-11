import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const financeReportAPI = {
  summary: (params) => http.get(ENDPOINTS.financeReport.summary, { params }),
  trend: (params) => http.get(ENDPOINTS.financeReport.trend, { params }),
  groupBreakdown: (params) =>
    http.get(ENDPOINTS.financeReport.groupBreakdown, { params }),
  ledger: (params) => http.get(ENDPOINTS.financeReport.ledger, { params }),
};
