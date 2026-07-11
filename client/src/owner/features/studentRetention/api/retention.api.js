import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const retentionAPI = {
  get: (params) => http.get(ENDPOINTS.adminDashboard.retention, { params }),
  churnedStudents: (params) =>
    http.get(ENDPOINTS.adminDashboard.churnedStudents, { params }),
};
