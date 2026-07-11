import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import MonthPicker from "../MonthPicker";
import { useDiscountUpdateMutation } from "../../hooks/useFinanceMutations";

const TYPE_OPTIONS = [
  { value: "percent", label: "Foiz (%)" },
  { value: "fixed", label: "Aniq summa (so'm)" },
];
const SCOPE_OPTIONS = [
  { value: "permanent", label: "Doimiy" },
  { value: "monthly", label: "Bitta oy uchun" },
];

// discount - karta orqali uzatiladi (ModalWrapper data)
const DiscountEditModal = ({ discount, close, setIsLoading }) => {
  const now = new Date();
  const form = useObjectState({
    type: discount?.type || "percent",
    value: discount?.value != null ? String(discount.value) : "",
    scope: discount?.scope || "permanent",
    year: discount?.year || now.getFullYear(),
    month: discount?.month || now.getMonth() + 1,
    reason: discount?.reason || "",
  });

  const mut = useDiscountUpdateMutation({
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
      id: discount._id,
      body: {
        type: form.type,
        value: Number(form.value),
        scope: form.scope,
        year: form.scope === "monthly" ? Number(form.year) : undefined,
        month: form.scope === "monthly" ? Number(form.month) : undefined,
        reason: form.reason,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {discount?.student?.firstName} {discount?.student?.lastName} -{" "}
        {discount?.group?.name}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Chegirma turi"
          value={form.type}
          onChange={(v) => form.setField("type", v)}
          options={TYPE_OPTIONS}
        />
        <InputField
          name="value"
          type={form.type === "percent" ? "number" : "money"}
          required
          label={form.type === "percent" ? "Foiz (%)" : "Summa (so'm)"}
          value={form.value}
          onChange={(e) => form.setField("value", e.target.value)}
        />
      </div>
      <SelectField
        label="Amal qilish doirasi"
        value={form.scope}
        onChange={(v) => form.setField("scope", v)}
        options={SCOPE_OPTIONS}
      />
      {form.scope === "monthly" && (
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
        name="reason"
        label="Sabab (ixtiyoriy)"
        value={form.reason}
        onChange={(e) => form.setField("reason", e.target.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
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

export default DiscountEditModal;
