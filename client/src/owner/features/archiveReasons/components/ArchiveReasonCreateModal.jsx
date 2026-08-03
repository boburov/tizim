import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import ArchiveReasonFormFields from "./ArchiveReasonFormFields";
import { useArchiveReasonCreateMutation } from "../hooks/useArchiveReasonMutations";

// `onCreated` - selectdan "Yangi qo'shish" orqali ochilganda beriladi:
// yaratilgan sabab darhol tanlanishi uchun (CreatableSelectField).
const ArchiveReasonCreateModal = ({
  close,
  isLoading,
  setIsLoading,
  onCreated,
}) => {
  const obj = useObjectState({ title: "" });

  const { mutate } = useArchiveReasonCreateMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      onCreated?.(data);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!obj.title.trim()) return;
    setIsLoading(true);
    mutate({ title: obj.title.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <ArchiveReasonFormFields obj={obj} disabled={isLoading} />
      <div className="flex gap-2 pt-1">
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

export default ArchiveReasonCreateModal;
