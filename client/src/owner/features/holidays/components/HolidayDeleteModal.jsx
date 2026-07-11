import Button from "@/shared/components/ui/button/Button";
import { useHolidayRemoveMutation } from "../hooks/useHolidayMutations";

const HolidayDeleteModal = ({ holiday, close, isLoading, setIsLoading }) => {
  const { mutate } = useHolidayRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{holiday?.name}</span> bayrami
        arxivlanadi. Avto-yuborish to'xtaydi.
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
            mutate(holiday._id);
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

export default HolidayDeleteModal;
