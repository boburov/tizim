// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const studentTimelineAPI = {
  list: (studentId, params) =>
    http.get(ENDPOINTS.activityHistory.student(studentId), { params }),
};
