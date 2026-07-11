// Router
import { useNavigate } from "react-router-dom";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupPermanentRemoveMutation from "../../hooks/useGroupPermanentRemoveMutation";

// Guruh o'chirilganda yo'q qilinadigan ma'lumotlar (ogohlantirish uchun).
const DELETE_ITEMS = [
  "O'quvchi a'zoliklari (o'qish davrlari)",
  "Davomat va baholar",
  "To'lovlar, oylik narx va chegirmalar",
  "O'qituvchi dars davrlari va maoshlari (chiqim)",
  "Fikr-mulohazalar",
];

const GroupPermanentDeleteModal = ({ group, close, isLoading, setIsLoading }) => {
  const navigate = useNavigate();
  const name = (group?.name || "").trim();

  const obj = useObjectState({ step: 1, confirmName: "" });

  const { mutate } = useGroupPermanentRemoveMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
      navigate("/owner/groups", { replace: true });
    },
    onError: () => setIsLoading(false),
  });

  const handleConfirm = () => {
    setIsLoading(true);
    mutate({ id: group._id, confirmName: obj.confirmName.trim() || undefined });
  };

  const nameMatches = obj.confirmName.trim() === name;

  // 1-bosqich: kuchli ogohlantirish.
  if (obj.step === 1) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">
            ⚠ {name} guruhi butunlay o'chiriladi. Bu amalni qaytarib bo'lmaydi.
          </p>
          <p className="mt-2">Quyidagilarning barchasi yo'q qilinadi:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {DELETE_ITEMS.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
          <p className="mt-2">
            O'quvchilar va o'qituvchilar o'chmaydi - faqat ushbu guruh bilan bog'liq
            ma'lumotlar. Depozitdan qoplangan to'lovlar o'quvchilar depozitiga qaytariladi.
          </p>
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

  // 2-bosqich: nom yozib tasdiqlash.
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Tasdiqlash uchun guruh nomini yozing:{" "}
        <span className="font-semibold text-foreground">{name}</span>
      </p>

      <InputField
        name="confirmName"
        label="Guruh nomi"
        value={obj.confirmName}
        placeholder={name}
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

export default GroupPermanentDeleteModal;
