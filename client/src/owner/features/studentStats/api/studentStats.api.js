import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const studentStatsAPI = {
  get: (params) =>
    http.get(ENDPOINTS.adminDashboard.studentStats, { params }),
};
