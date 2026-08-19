import { useState } from "react";
import { ArrowRight } from "lucide-react";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { formatMoney } from "@/shared/utils/formatMoney";
import FinanceActionSheet from "./FinanceActionSheet";
import { METHOD_OPTIONS, today, validateAmount } from "./opsFormUtils";
import { useTransferMutation } from "../../hooks/useFinanceOps";

/**
 * ICHKI O'TKAZMA — bitta filial ichida hisobdan hisobga.
 *
 * ── FOYDALANUVCHIGA AYTILADIGAN ASOSIY NARSA ──
 * Bu amal NA DAROMAD, NA XARAJAT: umumiy pul miqdori o'zgarmaydi,
 * faqat qayerda turgani o'zgaradi. Panel buni ochiq yozadi, chunki
 * aks holda foydalanuvchi "bank → kassa" ni chiqim deb o'ylab,
 * xarajat hisobotida qidirishi mumkin.
 */
const TransferSheet = ({ open, onOpenChange }) => {
  const [form, setForm] = useState({
    fromMethod: "bank", toMethod: "cash", amount: "", date: today(), memo: "",
  });
  const [error, setError] = useState(null);
  const mutation = useTransferMutation();

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const sameAccount = form.fromMethod === form.toMethod;
  const amountError = validateAmount(form.amount);
  const invalid = Boolean(amountError) || sameAccount;

  const submit = (idempotencyKey) => {
    setError(null);
    mutation.mutate(
      { ...form, amount: Number(form.amount), idempotencyKey },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm((f) => ({ ...f, amount: "", memo: "" }));
        },
        onError: (err) =>
          setError(err?.response?.data?.message || "O'tkazma bajarilmadi"),
      },
    );
  };

  const label = (v) => METHOD_OPTIONS.find((m) => m.value === v)?.label || v;

  return (
    <FinanceActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Hisoblar orasida o'tkazma"
      description="Pul markaz ichida ko'chadi — daromad ham, xarajat ham emas"
      submitLabel="O'tkazish"
      disabled={invalid}
      isPending={mutation.isPending}
      error={error}
      confirm={{
        text: `${formatMoney(Number(form.amount) || 0)} — ${label(form.fromMethod)} hisobidan ${label(form.toMethod)} hisobiga.`,
      }}
      onSubmit={submit}
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
        <SelectField
          label="Qayerdan"
          value={form.fromMethod}
          onChange={set("fromMethod")}
          options={METHOD_OPTIONS}
        />
        <ArrowRight className="mb-3 size-4 text-muted-foreground" />
        <SelectField
          label="Qayerga"
          value={form.toMethod}
          onChange={set("toMethod")}
          options={METHOD_OPTIONS}
        />
      </div>
      {sameAccount && (
        <p className="text-xs text-destructive">
          Jo'natuvchi va qabul qiluvchi hisob bir xil bo'lmasligi kerak
        </p>
      )}

      <InputField
        label="Summa"
        type="money"
        value={form.amount}
        onChange={set("amount")}
        placeholder="0"
      />
      {form.amount && amountError && (
        <p className="text-xs text-destructive">{amountError}</p>
      )}

      <InputField label="Sana" type="date" value={form.date} onChange={set("date")} />
      <InputField
        label="Izoh"
        value={form.memo}
        onChange={set("memo")}
        placeholder="Ixtiyoriy"
      />

      <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
        Umumiy kassa qoldig'i <b className="text-foreground">o'zgarmaydi</b> — faqat
        taqsimoti o'zgaradi.
      </p>
    </FinanceActionSheet>
  );
};

export default TransferSheet;
