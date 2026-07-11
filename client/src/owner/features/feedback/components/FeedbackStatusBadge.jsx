import { Sparkles, Clock, CheckCircle2, XCircle } from "lucide-react";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import {
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_STATUS_SHORT_LABEL,
  FEEDBACK_STATUS_TONE,
} from "@/shared/constants/feedback";

const STATUS_ICON = {
  new: Sparkles,
  in_review: Clock,
  resolved: CheckCircle2,
  rejected: XCircle,
};

/**
 * Feedback status badge - yagona StatusBadge ustiga o'ralgan.
 * `short` - tor joylar (jadval) uchun qisqaroq label ("Ko'rilmoqda").
 * `withIcon` - status oldida kichik ikonka.
 */
const FeedbackStatusBadge = ({ status, short = false, withIcon = false }) => {
  if (!status) return null;
  const labels = short ? FEEDBACK_STATUS_SHORT_LABEL : FEEDBACK_STATUS_LABEL;
  return (
    <StatusBadge
      tone={FEEDBACK_STATUS_TONE[status] || "neutral"}
      icon={withIcon ? STATUS_ICON[status] : undefined}
    >
      {labels[status] || status}
    </StatusBadge>
  );
};

export default FeedbackStatusBadge;
