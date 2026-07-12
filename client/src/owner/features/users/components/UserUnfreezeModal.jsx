// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useStudentUnfreezeMutation } from "../hooks/useStudentFreezeMutations";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

const UserUnfreezeModal = ({ user, close, isLoading, setIsLoading }) => {
  const today = toDateInput(new Date());
  const obj = useObjectState({ endDate: today });

  const { mutate } = useStudentUnfreezeMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate({
      id: user._id,
      endDate: obj.endDate || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {user?.firstName} {user?.lastName}
        </span>{" "}
        muzlatishdan chiqariladi. Tanlangan sanadan boshlab o'quvchi yana faol
        bo'ladi (davomat va to'lov qayta hisoblanadi).
      </p>

      <InputField
        type="date"
        name="endDate"
        label="Chiqarish sanasi"
        value={obj.endDate}
        max={today}
        onChange={(e) => obj.setField("endDate", e.target.value)}
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
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? "Chiqarilmoqda..." : "Muzlatishdan chiqarish"}
        </Button>
      </div>
    </div>
  );
};

export default UserUnfreezeModal;
