// Router
import { useNavigate } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useUserPermanentRemoveMutation from "../hooks/useUserPermanentRemoveMutation";

// Constants
import { ROLES } from "@/shared/constants/roles";

// Rol bo'yicha o'chiriladigan ma'lumotlar (ogohlantirish uchun). Faqat o'quvchi va
// o'qituvchi cascade hard-delete qilinadi - ikkalasi ham 2 bosqichli tasdiqdan o'tadi.
const CASCADE_INFO = {
  [ROLES.STUDENT]: {
    subject: "o'quvchi",
    items: [
      "To'lovlar va to'lov tranzaksiyalari",
      "Depozit (garov) va depozit tranzaksiyalari",
      "Guruh a'zoliklari (o'qish davrlari)",
      "Davomat va baholar",
      "Chegirmalar va fikr-mulohazalar",
    ],
    note: "O'qituvchi maoshlari avtomatik qayta hisoblanadi.",
  },
  [ROLES.TEACHER]: {
    subject: "o'qituvchi",
    items: [
      "Maosh hisoblari va maosh to'lovlari (chiqim)",
      "Dars berish davrlari (guruhlarga biriktirish)",
      "O'qituvchi davomati va yo'qliklari",
      "Fikr-mulohazalar",
    ],
    note: "Guruhlar va o'quvchilar saqlanadi - bu o'qituvchi guruhlardan olib tashlanadi. O'chirilgan maosh to'lovlari o'tgan oylar chiqim hisobotidan ham chiqariladi.",
  },
};

const UserPermanentDeleteModal = ({ user, close, isLoading, setIsLoading }) => {
  const navigate = useNavigate();
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  const info = CASCADE_INFO[user?.role];

  const obj = useObjectState({ step: 1, confirmName: "" });

  const { mutate } = useUserPermanentRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
      navigate("/owner/users", { replace: true });
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate({ id: user._id, confirmName: obj.confirmName.trim() || undefined });
  };

  const nameMatches = obj.confirmName.trim() === fullName;

  // Kutilmagan rol (o'quvchi/o'qituvchi emas): bitta bosqichli zaxira oqim.
  if (!info) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <span className="font-semibold">{fullName}</span> butunlay o'chiriladi va
          tiklab bo'lmaydi. O'chirish faqat foydalanuvchi hech qanday ma'lumotga
          bog'liq bo'lmaganda mumkin - aks holda xatolik chiqadi.
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
            {isLoading ? "O'chirilmoqda..." : "Ha, butunlay o'chirish"}
          </Button>
        </div>
      </div>
    );
  }

  // 1-bosqich: kuchli ogohlantirish (rol bo'yicha ro'yxat).
  if (obj.step === 1) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">
            ⚠ {fullName} butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.
          </p>
          <p className="mt-2">Quyidagilarning barchasi yo'q qilinadi:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {info.items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <p className="mt-2">{info.note}</p>
        </div>

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
            onClick={() => obj.setField("step", 2)}
            disabled={isLoading}
            className="flex-1"
          >
            Davom etish
          </Button>
        </div>
      </div>
    );
  }

  // 2-bosqich: ism yozib tasdiqlash.
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tasdiqlash uchun {info.subject}ning to'liq ismini yozing:{" "}
        <span className="font-semibold text-foreground">{fullName}</span>
      </p>

      <InputField
        name="confirmName"
        label="To'liq ism"
        value={obj.confirmName}
        placeholder={fullName}
        autoComplete="off"
        onChange={(e) => obj.setField("confirmName", e.target.value)}
        disabled={isLoading}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => obj.setField("step", 1)}
          disabled={isLoading}
          className="flex-1"
        >
          Orqaga
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={handleConfirm}
          disabled={isLoading || !nameMatches}
          className="flex-1"
        >
          {isLoading ? "O'chirilmoqda..." : "Butunlay o'chirish"}
        </Button>
      </div>
    </div>
  );
};

export default UserPermanentDeleteModal;
