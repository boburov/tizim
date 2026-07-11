import { useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import { useReplyMutation } from "../../hooks/useFeedbackMutations";
import InputField from "@/shared/components/ui/input/InputField";

const ReplyModal = ({
  feedbackId,
  currentReply,
  close,
  isLoading,
  setIsLoading,
}) => {
  const [message, setMessage] = useState(currentReply || "");
  const { mutate } = useReplyMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setIsLoading(true);
    mutate({ id: feedbackId, message: message.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        required
        type="textarea"
        value={message}
        label="Javob matni"
        disabled={isLoading}
        name="reply-message"
        placeholder="Javob..."
        onChange={(e) => setMessage(e.target.value)}
      />

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
          type="submit"
          disabled={isLoading || !message.trim()}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default ReplyModal;
