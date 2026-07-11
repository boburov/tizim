import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const ratingAPI = {
  leaderboard: (params) =>
    http.get(ENDPOINTS.rating.leaderboard, { params }),
  getSettings: () => http.get(ENDPOINTS.rating.settings),
  updateSettings: (body) => http.patch(ENDPOINTS.rating.settings, body),
  studentRank: (studentId, params) =>
    http.get(ENDPOINTS.rating.studentRank(studentId), { params }),
};
