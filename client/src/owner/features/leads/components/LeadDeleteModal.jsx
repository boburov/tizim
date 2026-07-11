import Button from "@/shared/components/ui/button/Button";
import { useLeadRemoveMutation } from "../hooks/useLeadMutations";

const LeadDeleteModal = ({ lead, close, isLoading, setIsLoading }) => {
  const { mutate } = useLeadRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {lead?.firstName} {lead?.lastName}
        </span>{" "}
        lidi o'chiriladi. Bu amalni qaytarib bo'lmaydi.
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
            mutate(lead._id);
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

export default LeadDeleteModal;
