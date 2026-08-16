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
 * SO'ROV KALITI (`qk.*`) esa BIR XIL qoladi - shuning uchun ikkala
 * panel ochilganda TanStack so'rovni takrorlamaydi, keshni bo'lishadi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * HAR MANZIL SERVERGA QARAB TEKSHIRILGAN (marshrut fayli + validator +
 * servis imzosi). Frontend fayl nomidan taxmin qilingan manzil YO'Q.
 */
export const executiveAPI = {
  // ── /admin-dashboard (Prisma'ga ko'chirilgan, ishlaydi) ──
  //
  // overview:    ?year&month          (period.validator.js)
  // cashflow:    ?range&year&month    (cashflow.validator.js)
  // studentFlow: ?months              (monthsBack.validator.js)
  overview: (params) => http.get(ENDPOINTS.adminDashboard.overview, { params }),
  cashflow: (params) => http.get(ENDPOINTS.adminDashboard.cashflow, { params }),
  studentFlow: (params) =>
    http.get(ENDPOINTS.adminDashboard.studentFlow, { params }),

  // ── HALI KO'CHIRILMAGAN (501 "MODULE_NOT_MIGRATED" qaytaradi) ──
  //
  // Ular ATAYLAB chaqiriladi: foydalanuvchi "Manba ulanmagan" degan
  // ANIQ xabarni ko'radi, modul ko'chgach esa ekran O'ZI jonlanadi -
  // bu yerda hech narsa o'zgartirilmaydi.
  //
  // DIQQAT: ilgari bu chaqiruvlar 10 SONIYA osilib, keyin 500 berardi
  // (Mongoose buferi). Server tuzatildi: `config/legacyMongoose.js`
  // buferni o'chiradi, `errorHandler` esa xatoni 501 ga aylantiradi.

  /** GET /ai/insights — ?page&limit&status&kind&domain&severity&stance */
  insights: (params) => http.get("/ai/insights", { params }),

  /** GET /ai/briefing */
  briefing: (params) => http.get("/ai/briefing", { params }),

  /**
   * GET /branch-analytics/pnl — ?from&to&consolidated
   *
   * DIQQAT: `year`/`month` QABUL QILMAYDI (pnlSchema: `from`, `to`
   * sanalar). Ilgari shu yerda `{year, month}` yuborilardi va ular
   * JIMGINA tashlab yuborilardi - natijada aniq oy sarlavhasi ostida
   * BUTUN TARIX bo'yicha summa chiqardi.
   */
  branchPnl: (params) => http.get("/branch-analytics/pnl", { params }),
};

// `/finance-report` OLIB TASHLANDI.
//
// Bunday manzil YO'Q - u 404 berardi. Haqiqiy marshrutlar:
//   /finance-report/summary          /finance-report/trend
//   /finance-report/group-breakdown  /finance-report/ledger
//   /finance-report/write-offs
// Rahbariyat qobig'i ularning hech birini ishlatmaydi (moliya hisoboti
// operatsion panelda). Kerak bo'lganda ANIQ pastki manzil qo'shiladi.
