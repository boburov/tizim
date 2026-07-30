// AI maslahatchi - public API.
// Tashqi kod faqat shu fayldan import qiladi.

export { default as ActionCenterPage } from "./pages/ActionCenterPage";

export { default as useActionCenterQuery } from "./hooks/useActionCenterQuery";
export { useInsightsQuery, useInsightsBySubjects } from "./hooks/useInsightsQuery";
export {
  useAckInsightMutation,
  useResolveInsightMutation,
  useDismissInsightMutation,
  useRecomputeMutation,
} from "./hooks/useInsightMutations";
