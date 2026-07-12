// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useStudentFreezeMutation } from "../hooks/useStudentFreezeMutations";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";

const UserFreezeModal = ({ user, close, isLoading, setIsLoading }) => {
  const today = toDateInput(new Date());
  const obj = useObjectState({ startDate: today, reason: "" });

  const { mutate } = useStudentFreezeMutation({
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
      startDate: obj.startDate || undefined,
      reason: obj.reason?.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {user?.firstName} {user?.lastName}
        </span>{" "}
        muzlatiladi. Muzlatilgan davrda o'quvchi guruhda qoladi, lekin{" "}
        <span className="font-medium">davomat va to'lov hisoblanmaydi</span>.
        Keyin istalgan payt muzlatishdan chiqarish mumkin.
      </p>

      <InputField
        type="date"
        name="startDate"
        label="Muzlatish sanasi"
        value={obj.startDate}
        min={user?.enrolledAt ? toDateInput(user.enrolledAt) : undefined}
        max={today}
        onChange={(e) => obj.setField("startDate", e.target.value)}
        disabled={isLoading}
      />

      <InputField
        type="text"
        name="reason"
        label="Sabab (ixtiyoriy)"
        value={obj.reason}
        onChange={(e) => obj.setField("reason", e.target.value)}
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
          {isLoading ? "Muzlatilmoqda..." : "Muzlatish"}
        </Button>
      </div>
    </div>
  );
};

export default UserFreezeModal;
