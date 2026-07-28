// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useRoleFreezeMutation } from "../../hooks/useRoleMutations";

// Rolni muzlatish/muzdan chiqarish tasdiqlash oynasi.
// Muzlatilganda rol egalari tizimga KIRA OLMAYDI: login rad etiladi va
// ochiq sessiyalari darhol uziladi.
const RoleFreezeModal = ({ role, close, isLoading, setIsLoading }) => {
  const isFreezing = !role?.isFrozen;

  const form = useObjectState({ reason: "" });
  const { reason, setField } = form;

  const { mutate } = useRoleFreezeMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = () => {
    setIsLoading(true);
    mutate({ value: role.value, isFrozen: isFreezing, reason });
  };

  return (
    <div className="space-y-4">
      {isFreezing ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-semibold">{role?.label}</span> roli
            muzlatiladi.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Bu roldagi {role?.userCount || 0} ta foydalanuvchi tizimga kira olmaydi</li>
            <li>Ochiq sessiyalar darhol uziladi</li>
            <li>Rolni istalgan vaqtda muzdan chiqarish mumkin</li>
          </ul>
          <InputField
            name="reason"
            label="Sabab"
            value={reason}
            placeholder="Ixtiyoriy - foydalanuvchiga ko'rsatiladi"
            onChange={(e) => setField("reason", e.target.value)}
          />
        </div>
      ) : (
        <p className="text-sm">
          <span className="font-semibold">{role?.label}</span> roli muzdan
          chiqariladi va egalari yana tizimga kira oladi.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={isLoading}
          onClick={() => close?.()}
        >
          Bekor qilish
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={isLoading}
          onClick={handleSubmit}
        >
          {isLoading
            ? "Bajarilmoqda..."
            : isFreezing
              ? "Muzlatish"
              : "Muzdan chiqarish"}
        </Button>
      </div>
    </div>
  );
};

export default RoleFreezeModal;
