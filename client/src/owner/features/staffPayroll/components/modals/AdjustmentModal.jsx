// Icons
import { AlertTriangle } from "lucide-react";

// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import InputMoney from "@/shared/components/ui/input/InputMoney";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { useAdjustmentCreateMutation } from "../../hooks/useStaffPayroll";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";
import { toast } from "sonner";

/**
 * QO'LDA BONUS yoki JARIMA.
 *
 * Bitta komponent ikkala holat uchun: farq faqat ishorada va matnda.
 * `kind` payload orqali keladi ("bonus" | "penalty").
 *
 * SABAB MAJBURIY: "nega 200 000 ushlab qolindi?" degan savolga javobsiz
 * jarima ishonchni buzadi, shuning uchun bo'sh sabab bilan saqlab
 * bo'lmaydi (server ham rad etadi).
 */
const AdjustmentModal = ({
  employee,
  year,
  month,
  kind = "bonus",
  close,
  isLoading,
  setIsLoading,
}) => {
  const isPenalty = kind === "penalty";
  const obj = useObjectState({
    amount: "",
    reason: "",
    occurredAt: toDateInput(new Date()),
  });

  const { mutate } = useAdjustmentCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      toast.success(isPenalty ? "Jarima qo'shildi" : "Bonus qo'shildi");
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const amount = Number(obj.amount);
  const valid = amount > 0 && obj.reason.trim().length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setIsLoading(true);
    mutate({
      employee: employee?._id,
      year,
      month,
      kind,
      amount,
      reason: obj.reason.trim(),
      occurredAt: obj.occurredAt || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">
          {employee?.firstName} {employee?.lastName}
        </span>{" "}
        uchun {String(month).padStart(2, "0")}.{year} oyiga{" "}
        {isPenalty ? "jarima" : "bonus"} yoziladi.
      </p>

      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="amount">
          Summa
        </label>
        <InputMoney
          id="amount"
          name="amount"
          value={obj.amount}
          onChange={(e) => obj.setField("amount", e.target.value)}
          placeholder="0"
          disabled={isLoading}
        />
      </div>

      <InputField
        name="reason"
        label="Sabab"
        value={obj.reason}
        onChange={(e) => obj.setField("reason", e.target.value)}
        placeholder={
          isPenalty ? "Masalan: 3 kun kechikib keldi" : "Masalan: tadbir tashkil qildi"
        }
        required
        disabled={isLoading}
      />

      <InputField
        type="date"
        name="occurredAt"
        label="Sana"
        value={obj.occurredAt}
        onChange={(e) => obj.setField("occurredAt", e.target.value)}
        disabled={isLoading}
      />

      {isPenalty && (
        <div className="flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>Jarima oylik summadan ayiriladi va maosh varaqasida ko'rinadi.</p>
        </div>
      )}

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
          type="submit"
          variant={isPenalty ? "destructive" : "default"}
          disabled={isLoading || !valid}
          className="flex-1"
        >
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default AdjustmentModal;
