import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const profileAPI = {
  updateProfile: (body) => http.patch(ENDPOINTS.auth.updateMe, body),
  changePassword: (body) => http.post(ENDPOINTS.auth.changePassword, body),
};
