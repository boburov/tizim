// State
import { useState } from "react";

// Icons
import { Copy, Eye, EyeOff, KeyRound, Pencil } from "lucide-react";

// Sonner
import { toast } from "sonner";

// Components
import Card from "@/shared/components/ui/card/Card";
import Button from "@/shared/components/ui/button/Button";

// Hooks
import useAuth from "@/shared/hooks/useAuth";
import useModal from "@/shared/hooks/useModal";
import useUserPasswordQuery from "../hooks/useUserPasswordQuery";

// Constants
import { MODAL } from "@/shared/constants/modals";
import { ROLES } from "@/shared/constants/roles";

// Owner uchun: detail sahifada foydalanuvchining ochiq parolini ko'rsatish + nusxa olish
const UserPasswordCard = ({ user }) => {
  const { isOwner } = useAuth();
  const { openModal } = useModal();
  // Parol default holatda yashirin - owner "ko'rsatish" tugmasi bilan ochadi
  const [visible, setVisible] = useState(false);

  // Parol faqat owner uchun va owner bo'lmagan foydalanuvchilar uchun ko'rsatiladi
  const enabled = isOwner && user?.role !== ROLES.OWNER && !!user?._id;
  const { data, isLoading } = useUserPasswordQuery(user?._id, enabled);

  if (!enabled) return null;

  const password = data?.password || "";

  const handleCopy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Parol nusxa olindi");
    } catch {
      toast.error("Nusxa olishda xatolik");
    }
  };

  return (
    <Card
      title="Parol"
      icon={<KeyRound className="size-4 text-muted-foreground" />}
    >
      <div className="mt-3 space-y-3">
        <div className="text-sm text-muted-foreground">
          Login:{" "}
          <span className="font-medium text-foreground">@{user?.username}</span>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : password ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 select-all break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm tracking-wide">
              {visible ? password : "•".repeat(Math.max(password.length, 8))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setVisible((v) => !v)}
              
              title={visible ? "Yashirish" : "Ko'rsatish"}
              aria-label={visible ? "Parolni yashirish" : "Parolni ko'rsatish"}
            >
              {visible ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </Button>
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

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => openModal(MODAL.USER_PASSWORD, { user })}
        >
          <Pencil className="size-4" />
          Parolni o'zgartirish
        </Button>
      </div>
    </Card>
  );
};

export default UserPasswordCard;
