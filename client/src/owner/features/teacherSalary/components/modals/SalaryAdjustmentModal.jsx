import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatMoney } from "@/shared/utils/formatMoney";
import { MONTH_LABELS } from "@/shared/constants/calendar";
import { useAddSalaryAdjustmentMutation } from "../../hooks/useSalaryMutations";

/**
 * O'QITUVCHIGA MUKOFOT yoki JARIMA.
 *
 * Bitta komponent ikkala holat uchun - farq faqat ishorada va matnda.
 * `kind` "bonus" | "deduction" bo'lib keladi (serverning o'z lug'ati;
 * xodimlar modulidagi "penalty" bilan ATAYLAB moslashtirilmagan, aks holda
 * payloadni ikki joyda tarjima qilishga to'g'ri kelardi).
 *
 * SABAB MAJBURIY: "nega 200 000 ushlab qolindi?" degan savolga javobsiz
 * jarima ishonchni buzadi. Server ham bo'sh sababni rad etadi.
 *
 * Bu PUL HARAKATI EMAS: oylik rejaga yangi qator qo'shiladi, kassadan pul
 * chiqmaydi. To'lov keyin odatdagi "To'lov" oynasi orqali beriladi.
 */
const SalaryAdjustmentModal = ({
  teacher,
  group,
  year,
  month,
  kind = "bonus",
  close,
  isLoading,
  setIsLoading,
}) => {
  const isPenalty = kind === "deduction";
  const form = useObjectState({ amount: "", reason: "" });

  const { mutate } = useAddSalaryAdjustmentMutation({
    onSuccess: () => {
      setIsLoading(false);
      toast.success(isPenalty ? "Jarima yozildi" : "Mukofot yozildi");
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const amount = Number(form.amount);
  const reason = form.reason.trim();
  const valid = amount > 0 && reason.length > 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setIsLoading(true);
    mutate({
      teacher: teacher?._id,
      // Guruh IXTIYORIY, lekin bor bo'lsa yuboriladi: server filialni
      // guruhdan aniqlaydi va qator hisobotda o'sha guruhga bog'lanadi.
      // Fiksa (base) qatoridan ochilganda guruh yo'q - filial o'qituvchidan olinadi.
      ...(group?._id ? { group: group._id } : {}),
      kind,
      year,
      month,
      amount,
      reason,
    });
  };

  const monthLabel = MONTH_LABELS[month - 1] || month;
  const fullName = `${teacher?.firstName || ""} ${teacher?.lastName || ""}`.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm">
        <p>
          <span className="font-semibold">{fullName}</span> uchun{" "}
          <span className="font-medium">
            {monthLabel} {year}
          </span>{" "}
          oyiga {isPenalty ? "jarima" : "mukofot"} yoziladi.
        </p>
        {group?.name && (
          <p className="mt-1 text-xs text-muted-foreground">Guruh: {group.name}</p>
        )}
      </div>

      <InputField
        name="amount"
        type="money"
        label="Summa"
        placeholder="0"
        required
        value={form.amount}
        onChange={(e) => form.setField("amount", e.target.value)}
        disabled={isLoading}
      />

      <InputField
        name="reason"
        label="Sabab"
        placeholder={
          isPenalty
            ? "Masalan: 3 ta darsga kelmadi"
            : "Masalan: qo'shimcha dars o'tdi"
        }
        required
        value={form.reason}
        onChange={(e) => form.setField("reason", e.target.value)}
        disabled={isLoading}
      />

      <div
        className={
          isPenalty
            ? "flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
            : "flex gap-2.5 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground"
        }
      >
        {isPenalty && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <p>
          {isPenalty
            ? `Jarima shu oylik hisobidan ayiriladi${
                amount > 0 ? ` (−${formatMoney(amount)})` : ""
              }. Kassadan pul chiqmaydi.`
            : `Mukofot shu oylik hisobiga qo'shiladi${
                amount > 0 ? ` (+${formatMoney(amount)})` : ""
              }. To'lovni keyin alohida berasiz.`}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => close?.()}
          disabled={isLoading}
        >
          Bekor qilish
        </Button>
        <Button
          type="submit"
          variant={isPenalty ? "danger" : "default"}
          className="flex-1"
          disabled={isLoading || !valid}
        >
          {isLoading ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default SalaryAdjustmentModal;
