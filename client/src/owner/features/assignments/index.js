// Sahifalar (owner va o'qituvchi panellari ikkovi ham shu yerdan oladi -
// farq faqat `basePath` prop'ida).
export { default as AssignmentsListPage } from "./pages/AssignmentsListPage";
export { default as AssignmentDetailPage } from "./pages/AssignmentDetailPage";

// API
export { assignmentsAPI } from "./api/assignments.api";

// Hooks
export {
  useAssignmentsQuery,
  useAssignmentDetailQuery,
  useAssignmentRecipientsQuery,
  useAssignmentPreviewQuery,
} from "./hooks/useAssignmentsQuery";
export {
  useSendAssignmentMutation,
  useDeleteAssignmentMutation,
  useDownloadAttachmentMutation,
} from "./hooks/useAssignmentMutations";

// Qayta ishlatiladigan komponentlar
export { default as AssignmentsTable } from "./components/AssignmentsTable";
export { default as AssignmentRecipientsTable } from "./components/AssignmentRecipientsTable";
export { default as BlockedWarning } from "./components/BlockedWarning";
export { default as DeliveryStatusBadge } from "./components/DeliveryStatusBadge";
export {
  DELIVERY_STATUS_META,
  deliveryStatusMeta,
} from "./utils/deliveryStatus";
export { default as AssignmentSendModal } from "./components/modals/AssignmentSendModal";
export { default as AssignmentDeleteModal } from "./components/modals/AssignmentDeleteModal";
