import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const notificationTemplatesAPI = {
  list: (params) => http.get(ENDPOINTS.notificationTemplates.base, { params }),
  byId: (id) => http.get(ENDPOINTS.notificationTemplates.byId(id)),
  create: (body) => http.post(ENDPOINTS.notificationTemplates.base, body),
  update: (id, body) =>
    http.patch(ENDPOINTS.notificationTemplates.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.notificationTemplates.byId(id)),
};
