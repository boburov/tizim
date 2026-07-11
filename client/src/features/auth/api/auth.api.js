// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const authAPI = {
  login: (body) => http.post(ENDPOINTS.auth.login, body),
  logout: () => http.post(ENDPOINTS.auth.logout),
  refresh: () => http.post(ENDPOINTS.auth.refresh),
  me: () => http.get(ENDPOINTS.auth.me),
  registerUser: (body) => http.post(ENDPOINTS.auth.registerUser, body),
};
