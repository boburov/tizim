import { useState } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import { useFeedbackTypeCreateMutation } from "../../hooks/useFeedbackTypeMutations";

// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan tur darhol tanlanishi uchun (CreatableSelectField).
const FeedbackTypeCreateModal = ({
  close,
  isLoading,
  setIsLoading,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const { mutate } = useFeedbackTypeCreateMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsLoading(true);
    mutate({ name: name.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <InputField
        name="name"
        label="Tur nomi"
        placeholder="Masalan: Shikoyat"
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
          {isLoading ? "Yaratilmoqda..." : "Yaratish"}
        </Button>
      </div>
    </form>
  );
};

export default FeedbackTypeCreateModal;
