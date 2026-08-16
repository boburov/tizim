import { useQuery } from "@tanstack/react-query";

import { qk } from "@/shared/lib/query/keys";
import { fromQuery } from "@/shared/components/dashboard/dataStatus";

import { executiveAPI } from "../api/executive.api";

/**
 * MA'LUMOT ADAPTERLARI - komponent bilan server orasidagi YAGONA qatlam.
 *
 * ═══════════════════════════════════════════════════════════════════
 * SHARTNOMA: har hook `{ status, data, error, refetch }` qaytaradi.
 *
 * Komponent TanStack ni ham, axios ni ham, endpoint manzilini ham
 * ko'rmaydi. Ertaga ma'lumot boshqa yo'ldan kelsa (SSE, WebSocket,
 * boshqa backend, prop orqali statik qiymat) - FAQAT shu fayl
 * o'zgaradi. Komponentlar TEGILMAYDI.
 *
 * SHAKLNI OCHISH HAM SHU YERDA. Server konvertlari har xil:
 *   /admin-dashboard/*      -> { success, data }
 *   /ai/insights            -> { success, data: [...], meta }
 *   /branch-analytics/pnl   -> { success, data: { items, totals, ... } }
 *
 * Komponent bularning birortasini ham bilmasligi kerak - u faqat
 * o'ziga kerakli SHAKLNI oladi (massiv yoki obyekt). Aks holda har
 * jadval o'z konvertini ochib yurardi va bittasi adashsa `rows.map is
 * not a function` bilan butun sahifa qulardi (aynan shunday bo'lgan).
 * ═══════════════════════════════════════════════════════════════════
 *
 * `retry: false` — DASHBOARD UCHUN ATAYLAB.
 * Standart TanStack uch marta qayta uradi. Ko'chirilmagan endpoint
 * uchun bu 501 ni uch marta olib, "manba ulanmagan" xabarini bir
 * necha soniyaga kechiktiradi va ekran shu vaqt davomida yuklanayotgan
 * bo'lib turadi.
 */

const BASE = { retry: false, refetchOnWindowFocus: false };

/**
 * Oy -> [birinchi kun, oxirgi kun] ISO chegaralari.
 *
 * `/branch-analytics/*` endpoint'larining HAMMASI `from`/`to` SANALARINI
 * kutadi (`rangeSchema`, `pnlSchema`), `year`/`month` NI EMAS. Zod
 * noma'lum kalitni JIMGINA tashlab yuboradi, ya'ni `{year, month}`
 * yuborilsa filtr umuman qo'llanmasdi va aniq oy sarlavhasi ostida
 * BUTUN TARIX summasi chiqardi - bu bir marta sodir bo'lgan.
 *
 * Shuning uchun aylantirish BITTA joyda turadi: uchta hook uni
 * takrorlaganda bittasi adashishi mumkin edi.
 */
const monthRange = (year, month) => {
  const hasPeriod = Number.isInteger(year) && Number.isInteger(month);
  if (!hasPeriod) return { from: undefined, to: undefined };
  return {
    from: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    to: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString(),
  };
};

/** Umumiy ko'rsatkichlar (tushum, o'quvchi, davomat). `?year&month` */
export const useOverviewData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.overview(params),
    queryFn: () => executiveAPI.overview(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};

/**
 * Pul oqimi. `?range&year&month`
 *
 * DAVR UZATILISHI SHART. Server `year`/`month` ni endi qabul qiladi;
 * berilmasa JORIY oyni qaytaradi va sahifadagi oy tanlagichi bilan
 * ziddiyat paydo bo'lardi ("Bu oy tushum: mart" + avgust ustunlari).
 */
export const useCashflowData = ({ range, year, month } = {}) => {
  const params = { range, year, month };
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.cashflow(params),
    queryFn: () => executiveAPI.cashflow(params).then((r) => r.data.data),
  });
  return fromQuery(query, {
    // Javob `{ range, buckets }` - bo'shlikni USTUNLAR bo'yicha
    // o'lchaymiz. Aks holda `{ buckets: [] }` obyekti "bo'sh emas"
    // bo'lib chiqib, grafik bo'sh maydon chizardi.
    emptyWhen: (d) => !d?.buckets?.length,
  });
};

/** O'quvchilar oqimi. `?months` (nechta oy orqaga). Oy tanlaganidan MUSTAQIL. */
export const useStudentFlowData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.studentFlow(params),
    queryFn: () => executiveAPI.studentFlow(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};

/**
 * AI tavsiyalari. `?page&limit&status&...`
 *
 * Konvert: `{ success, data: [...], meta: { page, limit, total, pages } }`
 * Bu yerda `r.data.data` MASSIV beradi (qolgan endpointlarda obyekt) -
 * shuning uchun `select` kerak emas, lekin himoya sifatida qoldirilgan.
 *
 * `/ai/*` moduli hali Mongoose'da va 501 qaytaradi -> `fromQuery` uni
 * avtomatik `not_connected` ga aylantiradi. Modul ko'chgach BU YERGA
 * HECH NARSA QO'SHILMAYDI.
 */
export const useInsightsData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.ai.list(params),
    queryFn: () => executiveAPI.insights(params).then((r) => r.data.data),
  });
  return fromQuery(query, {
    select: (d) => (Array.isArray(d) ? d : d?.items),
  });
};

/** Kunlik brifing (kecha / bugun / keyin / hozir). */
export const useBriefingData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.ai.briefing(params),
    queryFn: () => executiveAPI.briefing(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};

/**
 * Filiallar bo'yicha foyda/zarar.
 *
 * ═══════════════════════════════════════════════════════════════════
 * IKKI TUZATISH (ikkalasi ham jimgina buzilgan edi):
 *
 * 1) PARAMETRLAR. Endpoint `from`/`to` SANALARINI kutadi
 *    (`pnlSchema`), `year`/`month` NI EMAS. Ilgari `{year, month}`
 *    yuborilardi va zod ularni jimgina tashlab yuborardi - natijada
 *    "Avgust 2026" sarlavhasi ostida BUTUN TARIX summasi chiqardi.
 *    Endi oy chegaralari sanaga aylantiriladi.
 *
 * 2) SHAKL. Javob `{ consolidated, from, to, items, totals }` -
 *    KONVERT, massiv emas. Ilgari butun konvert jadvalga uzatilardi
 *    va `rows.map is not a function` bilan BUTUN ILOVA qularďi.
 * ═══════════════════════════════════════════════════════════════════
 */
export const useBranchPnlData = ({ year, month, consolidated } = {}) => {
  // Oyning [birinchi kun, oxirgi kun] chegarasi - UTC yarim tunlarda.
  // Server `z.coerce.date()` bilan qabul qiladi, ya'ni ISO satr kifoya.
  const params = { ...monthRange(year, month), consolidated };

  const query = useQuery({
    ...BASE,
    queryKey: qk.branchAnalytics.pnl(params),
    queryFn: () => executiveAPI.branchPnl(params).then((r) => r.data.data),
  });

  return fromQuery(query, {
    // Jadval FAQAT qatorlarni oladi - konvertni emas.
    select: (d) => d?.items,
    emptyWhen: (items) => !items?.length,
  });
};

/**
 * P&L yig'indilari (`totals`) - jadvaldan ALOHIDA manba.
 *
 * Bir so'rovdan ikki blok oziqlanadi, lekin ular alohida holatga ega
 * bo'lishi kerak: qatorlar bo'sh bo'lsa ham yig'indi 0 emas, YO'Q.
 */
export const useBranchPnlTotals = ({ year, month, consolidated } = {}) => {
  const params = { ...monthRange(year, month), consolidated };

  const query = useQuery({
    ...BASE,
    queryKey: qk.branchAnalytics.pnl(params),
    queryFn: () => executiveAPI.branchPnl(params).then((r) => r.data.data),
  });

  return fromQuery(query, { select: (d) => d?.totals });
};

/**
 * SOTUV VORONKASI filiallar kesimida. `?from&to`
 *
 * Javob TO'G'RIDAN-TO'G'RI massiv (`{ success, data: [...] }`), ya'ni
 * `items` konverti YO'Q - `/branch-analytics/pnl` dan farqi shu.
 * Taxmin emas: `sales.handler.js` `res.json({ success: true, data })`
 * bilan servis natijasini o'zi qaytaradi.
 */
export const useBranchSalesData = ({ year, month } = {}) => {
  const params = monthRange(year, month);
  const query = useQuery({
    ...BASE,
    queryKey: qk.branchAnalytics.sales(params),
    queryFn: () => executiveAPI.branchSales(params).then((r) => r.data.data),
  });
  return fromQuery(query, { emptyWhen: (rows) => !rows?.length });
};

/**
 * O'QITUVCHI RESURSI filiallar kesimida. `?from&to`
 *
 * ALOHIDA SO'ROV: bu endpoint `salary.read` talab qiladi, sotuv esa
 * `leads.read`. Bitta so'rovga birlashtirilsa, maosh ruxsati yo'q
 * foydalanuvchi sotuv raqamlarini ham ko'ra olmay qolardi.
 */
export const useBranchTeachersData = ({ year, month } = {}) => {
  const params = monthRange(year, month);
  const query = useQuery({
    ...BASE,
    queryKey: qk.branchAnalytics.teachers(params),
    queryFn: () => executiveAPI.branchTeachers(params).then((r) => r.data.data),
  });
  return fromQuery(query, { emptyWhen: (rows) => !rows?.length });
};
