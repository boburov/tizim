// State
import { useState } from "react";

// Icons
import { Copy } from "lucide-react";

// Sonner
import { toast } from "sonner";

// Components
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";

// Hooks
import useUserPasswordQuery from "../hooks/useUserPasswordQuery";
import useUserSetPasswordMutation from "../hooks/useUserSetPasswordMutation";

// `user` ModalWrapper data orqali keladi
const UserPasswordModal = ({ user, close, isLoading, setIsLoading }) => {
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading: isPwdLoading } = useUserPasswordQuery(user?._id);
  const currentPassword = data?.password || "";

  const { mutate } = useUserSetPasswordMutation({
    onSuccess: () => {
      setIsLoading(false);
      setNewPassword("");
    },
    onError: () => setIsLoading(false),
  });

  const handleCopy = async () => {
    if (!currentPassword) return;
    try {
      await navigator.clipboard.writeText(currentPassword);
      toast.success("Parol nusxa olindi");
    } catch {
      toast.error("Nusxa olishda xatolik");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const pwd = newPassword.trim();
    if (pwd.length < 6) {
      toast.error("Parol kamida 6 belgidan iborat bo'lishi kerak");
      return;
    }
    setIsLoading(true);
    mutate({ id: user._id, password: pwd });
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Login:{" "}
        <span className="font-medium text-foreground">@{user?.username}</span>
      </div>

      {/* Joriy parol */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Joriy parol</span>
        {isPwdLoading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : currentPassword ? (
          <div className="flex items-center gap-2">
            <InputField
              className="flex-1"
              type="text"
              value={currentPassword}
              readOnly
              autoComplete="off"
              placeholder=""
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              
              title="Nusxa olish"
              aria-label="Parolni nusxa olish"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Bu foydalanuvchi paroli saqlanmagan. Pastdan yangi parol o'rnating.
          </p>
        )}
      </div>

      <div className="border-t" />

      {/* Yangi parol o'rnatish */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <InputField
          type="password"
          name="newPassword"
          label="Yangi parol o'rnatish"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          disabled={isLoading}
        />
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => close?.()}
            disabled={isLoading}
            className="flex-1"
          >
            Yopish
          </Button>
          <Button type="submit" disabled={isLoading} className="flex-1">
            {isLoading ? "Saqlanmoqda..." : "Parolni yangilash"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default UserPasswordModal;
