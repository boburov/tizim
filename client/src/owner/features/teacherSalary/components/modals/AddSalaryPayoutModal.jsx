import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUz } from "@/shared/utils/formatDate";
import useTeacherSalaryQuery from "../../hooks/useTeacherSalaryQuery";
import {
  useAddSalaryPayoutMutation,
  useRemoveSalaryPayoutMutation,
} from "../../hooks/useSalaryMutations";

const METHODS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const fmtDate = (d) => (d ? formatDateUz(d) : "");

// salary - karta orqali uzatiladi (ModalWrapper data)
const AddSalaryPayoutModal = ({ salary, close, setIsLoading }) => {
  const { data, isLoading } = useTeacherSalaryQuery(salary?._id);
  const detail = data || salary || {};
  const expected = detail.expectedAmount || 0;
  const paid = detail.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);

  const form = useObjectState({
    amount: remaining > 0 ? String(remaining) : "",
    method: "cash",
    paidAt: todayKey(),
  });

  const addMut = useAddSalaryPayoutMutation({
    onSuccess: () => {
      setIsLoading(false);
      form.setField("amount", "");
    },
    onError: () => setIsLoading(false),
  });
  // O'chirishni tasdiqlash uchun: qaysi tranzaksiya tasdiq kutmoqda (inline confirm)
  const [confirmId, setConfirmId] = useState(null);
  const removeMut = useRemoveSalaryPayoutMutation({
    onSuccess: () => setConfirmId(null),
    onError: () => setConfirmId(null),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    // Maosh plani bo'yicha ORTIQCHA berib bo'lmaydi - faqat qoldiqqacha.
    if (amount > remaining) {
      toast.error(`Qoldiqdan oshib ketadi (qoldiq: ${formatMoney(remaining)})`);
      return;
    }
    setIsLoading(true);
    addMut.mutate({
      salaryId: salary._id,
      amount,
      method: form.method,
      paidAt: form.paidAt,
    });
  };

  const transactions = detail.transactions || [];

  // Maosh tarkibi (proratsiya)
  const proratedFixed = detail.proratedFixed || 0;
  const percentAmount = detail.percentAmount || 0;
  const factor = detail.prorationFactor ?? 1;
  const prorated = factor < 1;
  const payableDays = detail.payableDays || 0;
  const totalDays = detail.totalDays || 0;
  const daysLabel =
    prorated && totalDays
      ? ` (${payableDays}/${totalDays} kun · ${Math.round(factor * 100)}%)`
      : "";
  // To'liq oylikdan kunlarga ko'ra ayrilgan summa
  const fullFixed = factor > 0 ? Math.round(proratedFixed / factor) : 0;
  const fullPercent = factor > 0 ? Math.round(percentAmount / factor) : 0;
  const deducted = fullFixed - proratedFixed + (fullPercent - percentAmount);
  const hasBreakdown = proratedFixed > 0 || percentAmount > 0;

  return (
    <div className="space-y-5">
      {/* Teacher + group */}
      <div className="flex items-start justify-between gap-3">
        <p className="truncate font-medium leading-tight">
          {detail.teacher?.firstName} {detail.teacher?.lastName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {detail.group?.name}
        </p>
      </div>

      <div className="divide-y">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <p className="text-sm text-muted-foreground">To'lanishi kerak</p>
          <p className="text-sm">{formatMoney(expected)}</p>
        </div>

        <div className="flex items-center justify-between gap-2 py-1.5">
          <p className="text-sm text-muted-foreground">To'langan</p>
          <p className="text-sm text-green-600">{formatMoney(paid)}</p>
        </div>

        <div className="flex items-center justify-between gap-2 py-1.5">
          <p className="text-sm text-muted-foreground">To'lanmagan</p>
          <p className="text-sm text-red-600">{formatMoney(remaining)}</p>
        </div>
      </div>

      {hasBreakdown && (
        <div className="divide-y">
          {proratedFixed > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5">
              <p className="text-sm text-muted-foreground">Fiksa{daysLabel}</p>
              <p className="text-sm">{formatMoney(proratedFixed)}</p>
            </div>
          )}

          {percentAmount > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5">
              <p className="text-sm text-muted-foreground">
                Foiz ({detail.percentRate}% × {formatMoney(detail.groupRevenue || 0)})
                {daysLabel}
              </p>
              <p className="text-sm">{formatMoney(percentAmount)}</p>
            </div>
          )}

          {prorated && (detail.workStartDate || detail.workEndDate) && (
            <div className="flex items-center justify-between gap-2 py-1.5">
              <p className="text-sm text-muted-foreground">Ish davri</p>
              <p className="text-sm">
                {fmtDate(detail.workStartDate) || "oy boshi"} -{" "}
                {fmtDate(detail.workEndDate) || "oy oxiri"}
              </p>
            </div>
          )}

          {prorated && deducted > 0 && (
            <div className="flex items-center justify-between gap-2 py-1.5">
              <p className="text-sm text-muted-foreground">Proratsiya</p>
              <p className="text-sm text-yellow-600">
                −{formatMoney(deducted)} / -{Math.round((1 - factor) * 100)}%
              </p>
            </div>
          )}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <InputField
          name="amount"
          type="money"
          label="To'lov summasi"
          required
          placeholder="0"
          value={form.amount}
          onChange={(e) => form.setField("amount", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="To'lov turi"
            value={form.method}
            onChange={(v) => form.setField("method", v)}
            options={METHODS}
          />
          <InputField
            name="paidAt"
            type="date"
            label="Sana"
            value={form.paidAt}
            onChange={(e) => form.setField("paidAt", e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => close?.()}
          >
            Yopish
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={addMut.isPending || remaining <= 0}
          >
            {remaining <= 0 ? "To'liq berilgan" : "To'lovni qo'shish"}
          </Button>
        </div>
      </form>

      {/* Transactions */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">To'lovlar tarixi</p>
          {transactions.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {transactions.length} ta
            </span>
          )}
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Hali to'lov qilinmagan</p>
        ) : (
          <ul className="space-y-1">
            {transactions.map((t) => (
              <li
                key={t._id}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{formatMoney(t.amount)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.method === "cash" ? "Naqd" : "Karta"} ·{" "}
                    {formatDateUz(t.paidAt)}
                  </span>
                </div>
                {confirmId === t._id ? (
                  // Inline tasdiq: tasodifan bosishdan himoya. To'lovni o'chirish
                  // qaytarib bo'lmaydi (balansni qayta hisoblaydi).
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="danger"
                      className="h-7 px-2 text-xs"
                      disabled={removeMut.isPending}
                      onClick={() => removeMut.mutate(t._id)}
                    >
                      {removeMut.isPending ? "..." : "O'chirish"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={removeMut.isPending}
                      onClick={() => setConfirmId(null)}
                    >
                      Yo'q
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-rose-500 active:bg-rose-50"
                    onClick={() => setConfirmId(t._id)}
                    aria-label="O'chirish"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AddSalaryPayoutModal;
