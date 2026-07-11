import { useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import { useResolveMutation } from "../../hooks/useFeedbackMutations";
import InputField from "@/shared/components/ui/input/InputField";

const ResolveModal = ({
  feedbackId,
  currentReply,
  close,
  isLoading,
  setIsLoading,
}) => {
  const [adminReply, setAdminReply] = useState(currentReply || "");
  const { mutate } = useResolveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const isInvalid = !adminReply.trim();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isInvalid) return;
    setIsLoading(true);
    mutate({ id: feedbackId, adminReply: adminReply.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        required
        type="textarea"
        value={adminReply}
        label="Javob matni"
        disabled={isLoading}
        name="reply-message"
        placeholder="Izoh..."
        onChange={(e) => setAdminReply(e.target.value)}
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
          disabled={isLoading || isInvalid}
          className="flex-1"
        >
          {isLoading ? "Yopilmoqda..." : "Hal qilindi"}
        </Button>
      </div>
    </form>
  );
};


export default ResolveModal;
