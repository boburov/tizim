import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const coursesAPI = {
  list: (params) => http.get(ENDPOINTS.courses.base, { params }),
  create: (body) => http.post(ENDPOINTS.courses.base, body),
  update: (id, body) => http.patch(ENDPOINTS.courses.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.courses.byId(id)),
  prices: (id) => http.get(ENDPOINTS.courses.prices(id)),
  setPrice: (id, body) => http.put(ENDPOINTS.courses.prices(id), body),
  clearPrice: (id, branchId) => http.delete(ENDPOINTS.courses.clearPrice(id, branchId)),
};

export const roomsAPI = {
  list: (params) => http.get(ENDPOINTS.rooms.base, { params }),
  create: (body) => http.post(ENDPOINTS.rooms.base, body),
  update: (id, body) => http.patch(ENDPOINTS.rooms.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.rooms.byId(id)),
};
