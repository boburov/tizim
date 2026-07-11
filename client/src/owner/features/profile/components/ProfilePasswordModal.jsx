import useObjectState from "@/shared/hooks/useObjectState";
import useChangePasswordMutation from "../hooks/useChangePasswordMutation";

import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";

const ProfilePasswordModal = ({ close, isLoading, setIsLoading }) => {
  const obj = useObjectState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const { mutate } = useChangePasswordMutation({
    onError: () => setIsLoading(false),
  });

  const mismatch =
    obj.confirmPassword.length > 0 && obj.newPassword !== obj.confirmPassword;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mismatch) return;
    setIsLoading(true);
    mutate({
      currentPassword: obj.currentPassword,
      newPassword: obj.newPassword,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <InputField
        type="password"
        name="currentPassword"
        label="Joriy parol"
        placeholder="Joriy parolingiz"
        value={obj.currentPassword}
        onChange={(e) => obj.setField("currentPassword", e.target.value)}
        required
        disabled={isLoading}
      />
      <InputField
        type="password"
        name="newPassword"
        label="Yangi parol"
        value={obj.newPassword}
        onChange={(e) => obj.setField("newPassword", e.target.value)}
        required
        disabled={isLoading}
      />
      <InputField
        type="password"
        name="confirmPassword"
        label="Yangi parolni tasdiqlang"
        value={obj.confirmPassword}
        onChange={(e) => obj.setField("confirmPassword", e.target.value)}
        required
        disabled={isLoading}
        description={mismatch ? "Parollar mos kelmadi" : ""}
      />

      <p className="text-xs text-muted-foreground">
        Parol o'zgargandan so'ng tizimga qaytadan kirishingiz kerak bo'ladi.
      </p>

      <div className="flex gap-2 pt-2">
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
          type="submit"
          disabled={isLoading || mismatch}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "O'zgartirish"}
        </Button>
      </div>
    </form>
  );
};

export default ProfilePasswordModal;
