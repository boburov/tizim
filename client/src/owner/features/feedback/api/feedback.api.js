import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const feedbackAPI = {
  list: (params) => http.get(ENDPOINTS.feedback.base, { params }),
  byId: (id) => http.get(ENDPOINTS.feedback.byId(id)),
  me: (params) => http.get(ENDPOINTS.feedback.me, { params }),
  stats: (params) => http.get(ENDPOINTS.feedback.stats, { params }),
  submit: (body) => http.post(ENDPOINTS.feedback.base, body),
  review: (id) => http.post(ENDPOINTS.feedback.review(id)),
  reply: (id, body) => http.post(ENDPOINTS.feedback.reply(id), body),
  resolve: (id, body) => http.post(ENDPOINTS.feedback.resolve(id), body),
  reject: (id, body) => http.post(ENDPOINTS.feedback.reject(id), body),
};
