// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const usersAPI = {
  list: (params) => http.get(ENDPOINTS.users.base, { params }),
  byId: (id) => http.get(ENDPOINTS.users.byId(id)),
  // Yaratish faqat auth.register-user orqali (parol bilan birga)
  create: (body) => http.post(ENDPOINTS.auth.registerUser, body),
  update: (id, body) => http.patch(ENDPOINTS.users.byId(id), body),
  getPassword: (id) => http.get(ENDPOINTS.users.password(id)),
  setPassword: (id, password) =>
    http.patch(ENDPOINTS.users.password(id), { password }),
  remove: (id, body) => http.delete(ENDPOINTS.users.byId(id), { data: body }),
  restore: (id, body) =>
    http.post(`${ENDPOINTS.users.byId(id)}/restore`, body),
  permanentRemove: (id, body) =>
    http.delete(`${ENDPOINTS.users.byId(id)}/permanent`, { data: body }),
  groupHistory: (id, params) =>
    http.get(ENDPOINTS.users.groupHistory(id), { params }),
};
