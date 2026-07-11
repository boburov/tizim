import Button from "@/shared/components/ui/button/Button";
import useModal from "@/shared/hooks/useModal";
import { MODAL } from "@/shared/constants/modals";
import { useReviewMutation } from "../hooks/useFeedbackMutations";

const FeedbackActionsBar = ({ feedback }) => {
  const { openModal } = useModal();
  const { mutate: review, isPending: isReviewing } = useReviewMutation();

  if (!feedback) return null;
  const status = feedback.status;
  const canReview = status === "new";
  const canResolveReject = status === "new" || status === "in_review";
  const canReply = status !== "rejected";

  return (
    <div className="flex flex-wrap gap-2">
      {canReview && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => review(feedback._id)}
          disabled={isReviewing}
        >
          Ko'rib chiqilmoqda
        </Button>
      )}
      {canReply && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            openModal(MODAL.FEEDBACK_REPLY, { feedbackId: feedback._id })
          }
        >
          Javob yozish
        </Button>
      )}
      {canResolveReject && (
        <>
          <Button
            size="sm"
            onClick={() =>
              openModal(MODAL.FEEDBACK_RESOLVE, {
                feedbackId: feedback._id,
                currentReply: feedback.adminReply,
              })
            }
          >
            Hal qilindi
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() =>
              openModal(MODAL.FEEDBACK_REJECT, { feedbackId: feedback._id })
            }
          >
            Rad etish
          </Button>
        </>
      )}
    </div>
  );
};

export default FeedbackActionsBar;
