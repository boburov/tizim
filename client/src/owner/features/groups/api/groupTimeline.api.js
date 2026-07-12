// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const groupTimelineAPI = {
  list: (groupId, params) =>
    http.get(ENDPOINTS.activityHistory.group(groupId), { params }),
};
