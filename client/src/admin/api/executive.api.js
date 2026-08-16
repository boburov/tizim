import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

/**
 * EXECUTIVE QATLAMINING MA'LUMOT MANBALARI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA `owner/features/adminDashboard` DAN IMPORT QILINMAYDI
 *
 * U feature'ning ICHKI fayli. FSD qoidasi bo'yicha tashqaridan faqat
 * `index.js` (public API) orqali murojaat qilinadi, u esa API
 * obyektini eksport qilmaydi - faqat sahifani.
 *
 * Ikki panelni bir-biriga bog'lash o'rniga bitta qatorlik axios
 * chaqiruvi takrorlanadi. Bu ATAYLAB: `/owner` operatsion paneli
 * ertaga o'z dashboard'ini o'zgartirsa yoki olib tashlasa, rahbariyat
 * ekrani shundan yiqilmasligi kerak.
 *
 * SO'ROV KALITI (`qk.adminDashboard.*`) esa BIR XIL qoladi - shuning
 * uchun ikkala panel ochilganda TanStack so'rovni takrorlamaydi,
 * keshni bo'lishadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * HAR MANBA YONIDA UNING HOLATI YOZILGAN. Bu ro'yxat kodda
 * ISHLATILMAYDI (ulanganlik javobdan aniqlanadi - qarang
 * `dataStatus.js`, MISSING_ENDPOINT_CODES) - u faqat o'quvchi uchun
 * xarita.
 */
export const executiveAPI = {
  // ── TIRIK (server/MIGRATION.md §2: /admin-dashboard/* ko'chirilgan) ──
  overview: (params) => http.get(ENDPOINTS.adminDashboard.overview, { params }),
  cashflow: (params) => http.get(ENDPOINTS.adminDashboard.cashflow, { params }),
  studentFlow: (params) =>
    http.get(ENDPOINTS.adminDashboard.studentFlow, { params }),

  // ── HALI KO'CHIRILMAGAN (404 qaytaradi -> "Manba ulanmagan") ──
  // Ular ATAYLAB shu yerda turadi: sahifa ularni chaqiradi va
  // foydalanuvchi "bu ko'rsatkich hali ulanmagan" degan ANIQ xabarni
  // ko'radi. Chaqirmaslik ham mumkin edi, lekin u holda modul ko'chib
  // bo'lgach ham ekran bo'sh qolaverardi.
  insights: (params) => http.get("/ai/insights", { params }),
  briefing: (params) => http.get("/ai/briefing", { params }),
  financeReport: (params) => http.get("/finance-report", { params }),
  branchPnl: (params) => http.get("/branch-analytics/pnl", { params }),
};
