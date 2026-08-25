// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

/**
 * TANGA API — sof axios chaqiruvlari.
 *
 * ⚠ `shared/api/` DA, panel ichida EMAS. Tanga to'rtta panelda ham
 * ko'rinadi (ega, administrator, o'qituvchi, o'quvchi) va ularning
 * hammasi AYNI manzillarga boradi. Har panelda o'z nusxasi bo'lsa,
 * manzil o'zgarganda ulardan bittasi yangilanmay qolardi va faqat
 * o'sha panelda 404 chiqardi.
 * (`storage.api.js` / `export.api.js` bilan bir xil naqsh.)
 */
export const coinsAPI = {
  /** ⚠ Bo'lim o'chirilganda ham 200 qaytaradi (`{ enabled: false }`). */
  config: () => http.get(ENDPOINTS.coins.config),

  me: () => http.get(ENDPOINTS.coins.me),
  myHistory: (params) => http.get(ENDPOINTS.coins.myHistory, { params }),
  leaderboard: (params) => http.get(ENDPOINTS.coins.leaderboard, { params }),

  stats: () => http.get(ENDPOINTS.coins.stats),
  settings: () => http.get(ENDPOINTS.coins.settings),
  updateSettings: (body) => http.patch(ENDPOINTS.coins.settings, body),

  userWallet: (userId, params) =>
    http.get(ENDPOINTS.coins.userWallet(userId), { params }),
  adjust: (body) => http.post(ENDPOINTS.coins.adjust, body),
};
