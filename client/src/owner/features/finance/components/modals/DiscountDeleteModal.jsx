// Components
import Button from "@/shared/components/ui/button/Button";

// Hooks
import { useDiscountRemoveMutation } from "../../hooks/useFinanceMutations";

// discount - karta orqali uzatiladi (ModalWrapper data)
const DiscountDeleteModal = ({ discount, close, isLoading, setIsLoading }) => {
  const { mutate } = useDiscountRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate(discount._id);
  };

  const label =
    discount?.type === "percent"
      ? `${discount?.value}%`
      : `${discount?.value} so'm`;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {discount?.student?.firstName} {discount?.student?.lastName}
        </span>{" "}
        uchun {label} chegirma o'chiriladi. Bog'liq to'lovlar qayta hisoblanadi.
        Davom etasizmi?
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          autoFocus
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "Ha, o'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default DiscountDeleteModal;
