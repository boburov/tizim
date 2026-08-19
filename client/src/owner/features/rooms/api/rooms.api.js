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
};
