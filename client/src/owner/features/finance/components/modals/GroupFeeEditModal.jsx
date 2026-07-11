import InputField from "@/shared/components/ui/input/InputField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import MonthPicker from "../MonthPicker";
import { useGroupFeeUpsertMutation } from "../../hooks/useFinanceMutations";

// data: { groupId, groupName, year, month, amount, lockPeriod }
const GroupFeeEditModal = ({
  groupId,
  groupName,
  year,
  month,
  amount,
  lockPeriod = false,
  close,
  setIsLoading,
}) => {
  const now = new Date();
  const form = useObjectState({
    year: year || now.getFullYear(),
    month: month || now.getMonth() + 1,
    amount: amount != null ? String(amount) : "",
  });

  const mut = useGroupFeeUpsertMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    mut.mutate({
      groupId,
      year: Number(form.year),
      month: Number(form.month),
      amount: Number(form.amount) || 0,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {groupName && (
        <p className="text-sm text-muted-foreground">
          Guruh: <span className="font-medium text-foreground">{groupName}</span>
        </p>
      )}

      {!lockPeriod && (
        <div>
          <p className="mb-1 text-sm font-medium">Oy</p>
          <MonthPicker
            year={form.year}
            month={form.month}
            onChange={({ year: y, month: m }) => form.setFields({ year: y, month: m })}
          />
        </div>
      )}

      <InputField
        name="amount"
        type="money"
        label="To'lov miqdori (so'm)"
        required
        placeholder="0"
        value={form.amount}
        onChange={(e) => form.setField("amount", e.target.value)}
      />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => close?.()}>
          Bekor qilish
        </Button>
        <Button type="submit" disabled={mut.isPending}>
          Saqlash
        </Button>
      </div>
    </form>
  );
};

export default GroupFeeEditModal;
