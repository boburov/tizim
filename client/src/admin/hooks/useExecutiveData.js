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
 * Aynan shuning uchun bu yerda hech qanday JSX yo'q va shu yerda
 * hech qanday sonli hisob-kitob YO'Q: adapter faqat shakl o'zgartiradi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * `retry: false` — DASHBOARD UCHUN ATAYLAB.
 * Standart TanStack uch marta qayta uradi. Ko'chirilmagan endpoint
 * uchun bu 404 ni uch marta olib, "manba ulanmagan" xabarini bir
 * necha soniyaga kechiktiradi va ekran shu vaqt davomida yuklanayotgan
 * bo'lib turadi. Rahbariyat ekranida bitta ko'rsatkich uchun kutish
 * butun sahifani sekin ko'rsatadi.
 */

const BASE = { retry: false, refetchOnWindowFocus: false };

/** Umumiy ko'rsatkichlar (tushum, o'quvchi, davomat, qarzdorlik). */
export const useOverviewData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.overview(params),
    queryFn: () => executiveAPI.overview(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};

/** Pul oqimi (kirim/chiqim ustunlari). */
export const useCashflowData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.cashflow(params),
    queryFn: () => executiveAPI.cashflow(params).then((r) => r.data.data),
  });
  return fromQuery(query, {
    // Javob `{ buckets: [...] }` - bo'shlikni ustunlar bo'yicha
    // o'lchaymiz. Aks holda `{ buckets: [] }` obyekti "bo'sh emas"
    // bo'lib chiqib, grafik bo'sh maydon chizardi.
    emptyWhen: (d) => !d?.buckets?.length,
  });
};

/** O'quvchilar oqimi (qo'shilgan / ketgan). */
export const useStudentFlowData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.adminDashboard.studentFlow(params),
    queryFn: () => executiveAPI.studentFlow(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};

/**
 * AI tavsiyalari.
 *
 * `/ai/*` moduli hali Mongoose'da (server/MIGRATION.md §2) va 404
 * qaytaradi -> `fromQuery` uni avtomatik `not_connected` ga aylantiradi.
 * Modul ko'chgach BU YERGA HECH NARSA QO'SHILMAYDI: endpoint javob
 * bera boshlashi bilan ekran o'zi jonlanadi.
 */
export const useInsightsData = (params) => {
  const query = useQuery({
    ...BASE,
    // `qk.ai.insights()` PREFIKS (parametr olmaydi) - ro'yxat uchun
    // `qk.ai.list(params)`. Prefiksni kalit sifatida ishlatish barcha
    // insight so'rovlarini bitta keshga tiqib, filtrlar bir-birini
    // ustiga yozib yuborardi.
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

/** Filial bo'yicha foyda/zarar. */
export const useBranchPnlData = (params) => {
  const query = useQuery({
    ...BASE,
    queryKey: qk.branchAnalytics.pnl(params),
    queryFn: () => executiveAPI.branchPnl(params).then((r) => r.data.data),
  });
  return fromQuery(query);
};
