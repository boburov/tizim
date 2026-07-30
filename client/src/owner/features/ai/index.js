// AI maslahatchi - public API.
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
