import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const notificationsAPI = {
  list: (params) => http.get(ENDPOINTS.notifications.base, { params }),
  byId: (id) => http.get(ENDPOINTS.notifications.byId(id)),
  recipients: (id, params) =>
    http.get(ENDPOINTS.notifications.recipients(id), { params }),
  send: (body) => http.post(ENDPOINTS.notifications.base, body),
  preview: (body) => http.post(ENDPOINTS.notifications.preview, body),
  cancel: (id) => http.post(ENDPOINTS.notifications.cancel(id)),
  inbox: (params) => http.get(ENDPOINTS.notifications.inbox, { params }),
  unreadCount: () => http.get(ENDPOINTS.notifications.unreadCount),
  markRead: (id) => http.post(ENDPOINTS.notifications.markRead(id)),
  markAllRead: () => http.post(ENDPOINTS.notifications.markAllRead),
};
