import { useState } from "react";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import { formatMoney } from "@/shared/utils/formatMoney";
import { cn } from "@/shared/utils/cn";
import FinanceActionSheet from "./FinanceActionSheet";
import { METHOD_OPTIONS, today, validateAmount } from "./opsFormUtils";
import { useOwnerCapitalMutation } from "../../hooks/useFinanceOps";

/**
 * EGASINING PULI — kiritish yoki yechib olish.
 *
 * ── PANEL NEGA BUNI OCHIQ TUSHUNTIRADI ──
 * Egasi 20 mln kiritsa kassa oshadi, lekin markaz HECH NARSA SOTMAGAN.
 * Agar bu daromad deb yozilsa, o'sha oyning "foydasi" yolg'on
 * ko'tarilardi va "biznes o'zi pul topayaptimi?" degan asosiy savol
 * javobsiz qolardi.
 *
 * Server buni tuzilma darajasida ta'minlaydi (`owner_capital` hisobi,
 * `NON_OPERATING_ENTRY_KINDS`), panel esa buni foydalanuvchiga
 * AYTADI — aks holda u raqamni daromad hisobotida qidirib yuradi.
 */
const OwnerCapitalSheet = ({ open, onOpenChange, defaultDirection = "investment" }) => {
  const [form, setForm] = useState({
    direction: defaultDirection, amount: "", method: "bank", date: today(), memo: "",
  });
  const [error, setError] = useState(null);
  const mutation = useOwnerCapitalMutation();

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const amountError = validateAmount(form.amount);
  const isWithdrawal = form.direction === "withdrawal";

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
          setError(err?.response?.data?.message || "Yozuv qo'shilmadi"),
      },
    );
  };

  return (
    <FinanceActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Egasining puli"
      description="Operatsion daromad/xarajatga KIRMAYDI"
      submitLabel={isWithdrawal ? "Yechib olish" : "Kiritish"}
      disabled={Boolean(amountError)}
      isPending={mutation.isPending}
      error={error}
      confirm={{
        text: isWithdrawal
          ? `${formatMoney(Number(form.amount) || 0)} kassadan yechib olinadi.`
          : `${formatMoney(Number(form.amount) || 0)} kassaga kiritiladi.`,
      }}
      onSubmit={submit}
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: "investment", l: "Kiritish", d: "Egasi pul qo'shadi" },
          { v: "withdrawal", l: "Yechib olish", d: "Egasi pul oladi" },
        ].map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setForm((f) => ({ ...f, direction: o.v }))}
            className={cn(
              "rounded-xl border p-3 text-left transition",
              form.direction === o.v
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/30",
            )}
          >
            <p className="text-sm font-medium text-foreground">{o.l}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{o.d}</p>
          </button>
        ))}
      </div>

      <InputField
        label="Summa" type="money" value={form.amount}
        onChange={set("amount")} placeholder="0"
      />
      {form.amount && amountError && (
        <p className="text-xs text-destructive">{amountError}</p>
      )}

      <SelectField
        label="Hisob" value={form.method} onChange={set("method")} options={METHOD_OPTIONS}
      />
      <InputField label="Sana" type="date" value={form.date} onChange={set("date")} />
      <InputField label="Izoh" value={form.memo} onChange={set("memo")} placeholder="Ixtiyoriy" />

      <p className="rounded-lg bg-muted/50 p-2.5 text-xs text-muted-foreground">
        {isWithdrawal
          ? "Bu xarajat EMAS — foyda hisobiga kirmaydi, faqat kassa kamayadi."
          : "Bu daromad EMAS — foyda hisobiga kirmaydi, faqat kassa oshadi."}
      </p>
    </FinanceActionSheet>
  );
};

export default OwnerCapitalSheet;
