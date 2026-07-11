import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const activityLogsAPI = {
  list: (params) => http.get(ENDPOINTS.activityLogs.base, { params }),
  byId: (id) => http.get(ENDPOINTS.activityLogs.byId(id)),
  stats: (params) => http.get(ENDPOINTS.activityLogs.stats, { params }),
};
