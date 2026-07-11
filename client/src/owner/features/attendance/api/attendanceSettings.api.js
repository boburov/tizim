import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const attendanceSettingsAPI = {
  get: () => http.get(ENDPOINTS.attendanceSettings.base),
  update: (body) => http.patch(ENDPOINTS.attendanceSettings.base, body),
};
