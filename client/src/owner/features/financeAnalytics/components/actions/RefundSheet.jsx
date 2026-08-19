import { useState } from "react";

import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import SelectSearch from "@/shared/components/ui/select/SelectSearch";
import { formatMoney } from "@/shared/utils/formatMoney";
import FinanceActionSheet from "./FinanceActionSheet";
import { METHOD_OPTIONS, today, validateAmount } from "./opsFormUtils";
import { useRefundMutation } from "../../hooks/useFinanceOps";

/**
 * QAYTARIM.
 *
 * ── ASL TO'LOV NEGA MUHIM ──
 * `originalTransactionId` berilsa, server qaytarim TO'LANGAN summadan
 * oshmasligini tekshiradi (avval qaytarilganlarni ham hisobga olib).
 * Ya'ni bu maydon shunchaki ma'lumot emas — u HIMOYA.
 *
 * Aloqasiz qaytarim ham mumkin (o'quvchi umumiy hisobidan), lekin
 * o'shanda bu himoya ishlamaydi — panel buni ochiq aytadi.
 *
 * ── ASL TO'LOV TAHRIRLANMAYDI ──
 * Qaytarim ALOHIDA yozuv bo'lib tushadi. Tarixda ikkala amal ham
 * ko'rinadi. Bu server qoidasi (`postRefund`), panel esa uni
 * takrorlab, foydalanuvchida "to'lovni o'zgartirsam bo'lmaydimi?"
 * degan savol qolmasligini ta'minlaydi.
 */
const RefundSheet = ({ open, onOpenChange, student = null, payments = [] }) => {
  const [form, setForm] = useState({
    studentId: student?.id || "",
    originalTransactionId: "",
    amount: "", method: "cash", reason: "", date: today(),
  });
  const [error, setError] = useState(null);
  const mutation = useRefundMutation();

  const set = (k) => (e) =>
    setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const amountError = validateAmount(form.amount);
  const reasonError = form.reason.trim().length < 3 ? "Sabab kamida 3 belgi" : null;
  const invalid = Boolean(amountError) || Boolean(reasonError) || !form.studentId;

  const picked = payments.find((p) => p.id === form.originalTransactionId);
  const overOriginal = picked && Number(form.amount) > Number(picked.amount);

  const submit = (idempotencyKey) => {
    setError(null);
    mutation.mutate(
      {
        studentId: form.studentId,
        originalTransactionId: form.originalTransactionId || undefined,
        amount: Number(form.amount),
        method: form.method,
        reason: form.reason.trim(),
        date: form.date,
        idempotencyKey,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setForm((f) => ({ ...f, amount: "", reason: "" }));
        },
        onError: (err) =>
          setError(err?.response?.data?.message || "Qaytarim bajarilmadi"),
      },
    );
  };

  return (
    <FinanceActionSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Qaytarim"
      description={student ? `${student.firstName} ${student.lastName || ""}`.trim() : "O'quvchiga pul qaytarish"}
      submitLabel="Qaytarish"
      disabled={invalid || overOriginal}
      isPending={mutation.isPending}
      error={error}
      confirm={{
        text: `${formatMoney(Number(form.amount) || 0)} kassadan qaytariladi. Asl to'lov o'zgarmaydi — tarixda ikkala amal ham qoladi.`,
      }}
      onSubmit={submit}
    >
      {payments.length > 0 && (
        <SelectSearch
          label="Asl to'lov"
          value={form.originalTransactionId}
          onChange={set("originalTransactionId")}
          options={[
            { value: "", label: "Aloqasiz qaytarim" },
            ...payments.map((p) => ({
              value: p.id,
              label: `${formatMoney(p.amount)} · ${new Date(p.paidAt).toLocaleDateString("uz-UZ")}`,
            })),
          ]}
        />
      )}

      <InputField label="Summa" type="money" value={form.amount} onChange={set("amount")} placeholder="0" />
      {form.amount && amountError && <p className="text-xs text-destructive">{amountError}</p>}
      {overOriginal && (
        <p className="text-xs text-destructive">
          Qaytarim asl to'lovdan ({formatMoney(picked.amount)}) oshmasligi kerak
        </p>
      )}

      <SelectField label="Kanal" value={form.method} onChange={set("method")} options={METHOD_OPTIONS} />
      <InputField label="Sana" type="date" value={form.date} onChange={set("date")} />
      <InputField
        label="Sabab" value={form.reason} onChange={set("reason")}
        placeholder="Masalan: kursni tark etdi"
      />
      {form.reason && reasonError && <p className="text-xs text-destructive">{reasonError}</p>}

      {!form.originalTransactionId && (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-xs text-muted-foreground">
          Asl to'lov tanlanmadi — server &ldquo;to'langandan ortiq qaytarib bo'lmaydi&rdquo;
          tekshiruvini <b className="text-foreground">bajara olmaydi</b>.
        </p>
      )}
    </FinanceActionSheet>
  );
};

export default RefundSheet;
