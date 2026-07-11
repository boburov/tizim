import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const adminDashboardAPI = {
  overview: (params) =>
    http.get(ENDPOINTS.adminDashboard.overview, { params }),
  studentFlow: (params) =>
    http.get(ENDPOINTS.adminDashboard.studentFlow, { params }),
  cashflow: (params) =>
    http.get(ENDPOINTS.adminDashboard.cashflow, { params }),
};
