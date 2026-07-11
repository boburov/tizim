import Button from "@/shared/components/ui/button/Button";
import { useArchiveReasonRemoveMutation } from "../hooks/useArchiveReasonMutations";

const ArchiveReasonDeleteModal = ({ reason, close, isLoading, setIsLoading }) => {
  const { mutate } = useArchiveReasonRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{reason?.title}</span> sababi o'chiriladi.
        Eski hisobotlar saqlanib qoladi.
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
            mutate(reason._id);
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

export default ArchiveReasonDeleteModal;
