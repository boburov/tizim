import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const systemNotificationsAPI = {
  list: (params) => http.get(ENDPOINTS.systemNotifications.base, { params }),
  unreadCount: () => http.get(ENDPOINTS.systemNotifications.unreadCount),
  markRead: (id) => http.post(ENDPOINTS.systemNotifications.markRead(id)),
  markAllRead: () => http.post(ENDPOINTS.systemNotifications.markAllRead),
  create: (body) => http.post(ENDPOINTS.systemNotifications.base, body),
};
