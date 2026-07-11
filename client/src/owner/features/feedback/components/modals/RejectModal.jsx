import { useState } from "react";
import Button from "@/shared/components/ui/button/Button";
import { useRejectMutation } from "../../hooks/useFeedbackMutations";
import InputField from "@/shared/components/ui/input/InputField";

const RejectModal = ({ feedbackId, close, isLoading, setIsLoading }) => {
  const [reason, setReason] = useState("");
  const { mutate } = useRejectMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setIsLoading(true);
    mutate({ id: feedbackId, rejectionReason: reason.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-amber-700">
        
      </p>

      <InputField
        required
        type="textarea"
        value={reason}
        disabled={isLoading}
        name="reason-message"
        placeholder="Sabab..."
        label="Rad etish sababi"
        onChange={(e) => setReason(e.target.value)}
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
          variant="danger"
          disabled={isLoading || !reason.trim()}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "Rad etish"}
        </Button>
      </div>
    </form>
  );
};

export default RejectModal;
