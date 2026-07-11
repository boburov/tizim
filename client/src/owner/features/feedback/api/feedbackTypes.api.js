import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const feedbackTypesAPI = {
  list: (params) => http.get(ENDPOINTS.feedbackTypes.base, { params }),
  byId: (id) => http.get(ENDPOINTS.feedbackTypes.byId(id)),
  create: (body) => http.post(ENDPOINTS.feedbackTypes.base, body),
  update: (id, body) => http.patch(ENDPOINTS.feedbackTypes.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.feedbackTypes.byId(id)),
};
