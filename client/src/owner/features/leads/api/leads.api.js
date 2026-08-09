import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const leadsAPI = {
  list: (params) => http.get(ENDPOINTS.leads.base, { params }),
  byId: (id) => http.get(ENDPOINTS.leads.byId(id)),
  create: (body) => http.post(ENDPOINTS.leads.base, body),
  update: (id, body) => http.patch(ENDPOINTS.leads.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.leads.byId(id)),
  convert: (id, body) => http.post(ENDPOINTS.leads.convert(id), body),
  convertBulk: (body) => http.post(ENDPOINTS.leads.convertBulk, body),
  setReminder: (id, body) => http.post(ENDPOINTS.leads.reminder(id), body),
  setReminderBulk: (body) => http.post(ENDPOINTS.leads.reminderBulk, body),
  stats: (params) => http.get(ENDPOINTS.leads.stats, { params }),
  // Mas'ul tanlagichi uchun xodimlar - `leads.read` bilan ochiladi.
  assignees: () => http.get(ENDPOINTS.leads.assignees),
};
