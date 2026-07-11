import { useState } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import { useFeedbackTypeUpdateMutation } from "../../hooks/useFeedbackTypeMutations";

const FeedbackTypeEditModal = ({
  feedbackType,
  close,
  isLoading,
  setIsLoading,
}) => {
  const [name, setName] = useState(feedbackType?.name || "");
  const { mutate } = useFeedbackTypeUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsLoading(true);
    mutate({ id: feedbackType._id, body: { name: name.trim() } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        name="name"
        label="Tur nomi"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        autoFocus
        disabled={isLoading}
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
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default FeedbackTypeEditModal;
