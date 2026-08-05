// Components
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import InputMoney from "@/shared/components/ui/input/InputMoney";
import SelectField from "@/shared/components/ui/select/SelectField";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import { usePayoutMutation } from "../../hooks/useStaffPayroll";

// Utils
import { toDateInput } from "@/shared/utils/formatDate";
import { formatMoney } from "@/shared/utils/formatMoney";

const METHOD_OPTIONS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
];

/**
 * XODIMGA MAOSH TO'LASH.
 *
 * Summa QOLDIQDAN oshmaydi - server ham buni atomar tekshiradi
 * (ikki marta bosilgan tugma ikki barobar to'lovga aylanmaydi).
 * Filial chegarasidan oshsa so'rov tasdiqqa tushadi va pul HARAKAT
 * QILMAYDI - bu haqda modal ochiq aytadi.
 */
const StaffPayoutModal = ({ payroll, close, isLoading, setIsLoading }) => {
  const remaining = Math.max(
    0,
    (payroll?.finalAmount || 0) - (payroll?.paidAmount || 0),
  );

  const obj = useObjectState({
    amount: String(remaining || ""),
    method: "cash",
    paidAt: toDateInput(new Date()),
    note: "",
  });

  const { mutate } = usePayoutMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const amount = Number(obj.amount);
  const valid = amount > 0 && amount <= remaining;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valid) return;
    setIsLoading(true);
    mutate({
      payrollId: payroll._id,
      amount,
      method: obj.method,
      paidAt: obj.paidAt,
      note: obj.note || undefined,
      employeeName: `${payroll.employee?.firstName || ""} ${payroll.employee?.lastName || ""}`.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md border bg-muted/50 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Hisoblangan</span>
          <span className="font-medium tabular-nums">
            {formatMoney(payroll?.finalAmount)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">To'langan</span>
          <span className="tabular-nums">{formatMoney(payroll?.paidAmount)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t pt-1">
          <span className="font-medium">Qoldiq</span>
          <span className="font-semibold tabular-nums">{formatMoney(remaining)}</span>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="amount">
          To'lov summasi
        </label>
        <InputMoney
          id="amount"
          name="amount"
          value={obj.amount}
          onChange={(e) => obj.setField("amount", e.target.value)}
          disabled={isLoading}
        />
        {amount > remaining && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-300">
            Summa qoldiqdan oshib ketdi.
          </p>
        )}
      </div>

      <SelectField
        name="method"
        label="To'lov usuli"
        options={METHOD_OPTIONS}
        value={obj.method}
        onChange={(v) => obj.setField("method", v?.target?.value ?? v)}
        disabled={isLoading}
      />

      <InputField
        type="date"
        name="paidAt"
        label="To'lov sanasi"
        value={obj.paidAt}
        onChange={(e) => obj.setField("paidAt", e.target.value)}
        disabled={isLoading}
      />

      <InputField
        name="note"
        label="Izoh (ixtiyoriy)"
        value={obj.note}
        onChange={(e) => obj.setField("note", e.target.value)}
        disabled={isLoading}
      />

      <p className="text-xs text-muted-foreground">
        Summa filial chegarasidan oshsa so'rov tasdiqqa yuboriladi - egasi
        tasdiqlagunga qadar pul yozilmaydi.
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
        <Button type="submit" disabled={isLoading || !valid} className="flex-1">
          {isLoading ? "Yozilmoqda..." : "To'lash"}
        </Button>
      </div>
    </form>
  );
};

export default StaffPayoutModal;
