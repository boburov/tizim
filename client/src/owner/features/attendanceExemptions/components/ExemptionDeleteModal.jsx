import Button from "@/shared/components/ui/button/Button";
import { useExemptionRemoveMutation } from "../hooks/useExemptionMutations";

const ExemptionDeleteModal = ({ exemption, close, isLoading, setIsLoading }) => {
  const { mutate } = useExemptionRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate(exemption._id);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Davomatdan ozod davri o'chiriladi. Davom etasizmi?
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
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "O'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default ExemptionDeleteModal;
