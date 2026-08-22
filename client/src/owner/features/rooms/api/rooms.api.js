import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const roomAnalyticsAPI = {
  /**
   * Xona bandligi — xona × kun × soat.
   *
   * `branchId` IXTIYORIY: berilmasa server foydalanuvchining filial
   * ko'lamini qo'llaydi (administrator uchun — o'z filiali). Berilsa,
   * server o'sha filial chaqiruvchining ko'lamida ekanini tekshiradi
   * va bo'lmasa 403 qaytaradi.
   */
  utilization: (params = {}) =>
    http.get(ENDPOINTS.branchAnalytics.rooms, { params }),
  dashboard: (params = {}) =>
    http.get(ENDPOINTS.branchAnalytics.roomDashboard, { params }),
  finder: (params = {}) =>
    http.get(ENDPOINTS.branchAnalytics.roomFinder, { params }),
  schedule: (params = {}) =>
    http.get(ENDPOINTS.branchAnalytics.roomSchedule, { params }),
  details: (roomId, params = {}) =>
    http.get(ENDPOINTS.branchAnalytics.roomDetails(roomId), { params }),
};
