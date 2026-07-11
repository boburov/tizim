import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import StatusBadge from "@/shared/components/ui/badge/StatusBadge";
import useObjectState from "@/shared/hooks/useObjectState";
import { formatMoney } from "@/shared/utils/formatMoney";
import useStudentPaymentQuery from "../../hooks/useStudentPaymentQuery";
import {
  useAddTransactionMutation,
  useRemoveTransactionMutation,
} from "../../hooks/useFinanceMutations";
import { statusMeta } from "../../utils/status";
import { formatDateUz } from "@/shared/utils/formatDate";
import { Badge } from "@/shared/components/shadcn/badge";

const METHODS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
];

// Bir martada qabul qilinadigan maksimal summa (server ham shu chegarani tekshiradi).
const MAX_AMOUNT = 50_000_000;

const todayKey = () => new Date().toISOString().slice(0, 10);

// payment - karta orqali uzatiladi (ModalWrapper data)
const AddPaymentModal = ({ payment, close, setIsLoading }) => {
  const { data, isLoading } = useStudentPaymentQuery(payment?._id);
  const detail = data || payment || {};
  const expected = detail.expectedAmount || 0;
  const paid = detail.paidAmount || 0;
  const remaining = Math.max(0, expected - paid);
  const meta = statusMeta(detail.status);

  const form = useObjectState({
    amount: remaining > 0 ? String(remaining) : "",
    method: "cash",
    paidAt: todayKey(),
    // Double-click/retry bitta to'lovni ikki marta yozmasligi uchun server
    // tomonda dedupe kaliti. Muvaffaqiyatdan keyin yangilanadi (yangi to'lov
    // uchun), xatoda esa o'sha kalit qoladi (retry xavfsiz).
    idemKey: crypto.randomUUID(),
  });

  const addMut = useAddTransactionMutation({
    onSuccess: () => {
      setIsLoading(false);
      form.setFields({ amount: "", idemKey: crypto.randomUUID() });
    },
    onError: () => setIsLoading(false),
  });
  // O'chirishni tasdiqlash uchun: qaysi tranzaksiya tasdiq kutmoqda (inline confirm)
  const [confirmId, setConfirmId] = useState(null);
  const removeMut = useRemoveTransactionMutation({
    onSuccess: () => setConfirmId(null),
    onError: () => setConfirmId(null),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    if (amount > MAX_AMOUNT) {
      toast.error(`Bir martada ${formatMoney(MAX_AMOUNT)} dan ko'p kiritib bo'lmaydi`);
      return;
    }
    setIsLoading(true);
    addMut.mutate({
      paymentId: payment._id,
      amount,
      method: form.method,
      paidAt: form.paidAt,
      idempotencyKey: form.idemKey,
    });
  };

  const transactions = detail.transactions || [];

  const baseFee = detail.baseFee || 0;
  const factor = detail.prorationFactor ?? 1;
  const prorated = Math.round(baseFee * factor);
  const prorationCut = Math.max(0, baseFee - prorated);
  const discount = detail.discountApplied || 0;
  const joinedAt = detail.membership?.joinedAt;
  const hasBreakdown = prorationCut > 0 || discount > 0;
  // Tanlangan oy qoldig'idan ortgan summa - keyingi oylar + garovga taqsimlanadi.
  const overflow = Math.max(0, (Number(form.amount) || 0) - remaining);

  return (
    <div className="space-y-5">
      {/* Student + status */}
      <div className="flex items-start justify-between gap-3">
        <p className="truncate font-medium leading-tight">
          {detail.student?.firstName} {detail.student?.lastName}
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

      <div className="divide-y">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <p className="text-sm text-muted-foreground">Guruh to'lovi</p>
          <p className="text-sm">{formatMoney(baseFee)}</p>
        </div>

        <div className="flex items-center justify-between gap-2 py-1.5">
          <p className="text-sm text-muted-foreground">Guruhga qo'shilgan</p>
          <p className="text-sm">
            {joinedAt ? ` ${formatDateUz(joinedAt)}` : ""}
          </p>
        </div>

        {prorationCut > 0 && (
          <div className="flex items-center justify-between gap-2 py-1.5">
            <p className="text-sm text-muted-foreground">Proratsiya</p>
            <p className="text-sm text-yellow-600">
              −{formatMoney(prorationCut)} / -{Math.round((1 - factor) * 100)}%
            </p>
          </div>
        )}

        {discount > 0 && (
          <div className="flex items-center justify-between gap-2 py-1.5">
            <p className="text-sm text-muted-foreground">Chegirma</p>
            <p className="text-sm text-yellow-600">−{formatMoney(discount)}</p>
          </div>
        )}
      </div>

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
        {overflow > 0 && (
          <p className="text-xs text-muted-foreground">
            Ortig'i ({formatMoney(overflow)}) keyingi qoldiq oylarga, undan ortig'i
            esa garovga (depozit) o'tadi.
          </p>
        )}
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
          <Button type="submit" className="flex-1" disabled={addMut.isPending}>
            To'lovni qo'shish
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
          <p className="text-sm text-muted-foreground">
            Hali to'lov qilinmagan
          </p>
        ) : (
          <ul className="divide-y">
            {transactions.map((t) => (
              <li
                key={t._id}
                className="flex items-center justify-between gap-2 rounded-md py-1.5 text-sm"
              >
                <div className="flex items-baseline gap-2">
                  <Badge variant={t.method === "cash" ? "default" : "secondary"}>
                    {t.method === "cash" ? "Naqd" : "Karta"}
                  </Badge>
                  <span className="font-medium">{formatMoney(t.amount)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateUz(t.paidAt)}
                  </span>
                </div>

                {confirmId === t._id ? (
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

export default AddPaymentModal;
