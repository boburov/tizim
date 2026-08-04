// TAHLIL MARKAZI - public API.
//
// DIQQAT: papka/route/ruxsat nomlari `ai` bo'lib QOLDI (/owner/ai, ai.read).
// Ular ICHKI identifikatorlar: ruxsat kaliti bazada saqlanadi va uni
// o'zgartirish migratsiya talab qilardi, foydalanuvchi esa ularni ko'rmaydi.
// Foydalanuvchiga ko'rinadigan matn hamma joyda "Tahlil markazi".
// Tashqi kod faqat shu fayldan import qiladi.

export { default as OperationsCenterPage } from "./pages/OperationsCenterPage";
export { default as ActionCenterPage } from "./pages/ActionCenterPage";
export { default as AiReportsPage } from "./pages/AiReportsPage";
export { default as AiReportDetailPage } from "./pages/AiReportDetailPage";

// Modul sahifalari uchun: <AiDomainInsights domain="finance" />
export { default as AiDomainInsights } from "./components/AiDomainInsights";

export { default as useBriefingQuery } from "./hooks/useBriefingQuery";
export { default as useActionCenterQuery } from "./hooks/useActionCenterQuery";
export { useDomainInsightsQuery } from "./hooks/useDomainInsightsQuery";
export {
  useReportsQuery,
  useReportQuery,
  useLatestReportQuery,
} from "./hooks/useReportsQuery";
export { useInsightsQuery, useInsightsBySubjects } from "./hooks/useInsightsQuery";
export {
  useAckInsightMutation,
  useResolveInsightMutation,
  useDismissInsightMutation,
  useRecomputeMutation,
} from "./hooks/useInsightMutations";
