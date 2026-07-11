import Button from "@/shared/components/ui/button/Button";
import { formatDateTimeUz } from "@/shared/utils/formatDate";
import useCancelScheduledMutation from "../../hooks/useCancelScheduledMutation";

// Rejalashtirilgan xabarni bekor qilish tasdig'i (ModalWrapper ichida).
const CancelScheduledModal = ({ item, close, isLoading, setIsLoading }) => {
  const { mutate } = useCancelScheduledMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Ushbu xabar{" "}
        <span className="font-semibold">
          {item?.scheduleAt ? formatDateTimeUz(item.scheduleAt) : "belgilangan vaqtda"}
        </span>{" "}
        yuborilishi rejalashtirilgan. Rejani bekor qilasizmi? Bu amalni qaytarib
        bo'lmaydi.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Yo'q
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setIsLoading(true);
            mutate(item._id);
          }}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Bekor qilinmoqda..." : "Ha, bekor qilish"}
        </Button>
      </div>
    </div>
  );
};

export default CancelScheduledModal;
