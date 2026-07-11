import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const leadOptionsAPI = {
  list: (params) => http.get(ENDPOINTS.leadOptions.base, { params }),
  create: (body) => http.post(ENDPOINTS.leadOptions.base, body),
  update: (id, body) => http.patch(ENDPOINTS.leadOptions.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.leadOptions.byId(id)),
};
