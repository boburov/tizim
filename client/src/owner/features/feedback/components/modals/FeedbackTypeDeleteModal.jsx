import Button from "@/shared/components/ui/button/Button";
import { useFeedbackTypeRemoveMutation } from "../../hooks/useFeedbackTypeMutations";

const FeedbackTypeDeleteModal = ({
  feedbackType,
  close,
  isLoading,
  setIsLoading,
}) => {
  const { mutate } = useFeedbackTypeRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{feedbackType?.name}</span> turi
        arxivlanadi. Mavjud feedback'lar tarixida saqlanib qoladi.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setIsLoading(true);
            mutate(feedbackType._id);
          }}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default FeedbackTypeDeleteModal;
