import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import { ROLES } from "@/shared/constants/roles";
import { formatMoney } from "@/shared/utils/formatMoney";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import useStudentPaymentHistoryQuery from "@/owner/features/finance/hooks/useStudentPaymentHistoryQuery";
import { useAddTransactionMutation } from "@/owner/features/finance/hooks/useFinanceMutations";
import {
  useDepositTopupMutation,
  useDepositWithdrawMutation,
} from "../../hooks/useDepositMutations";

const METHODS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
];
// Bir martada qabul qilinadigan maksimal summa (server ham shu chegarani tekshiradi).
const MAX_AMOUNT = 50_000_000;
const todayKey = () => new Date().toISOString().slice(0, 10);
const fullName = (s) => `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "-";

// mode: "add" (kirim) yoki "withdraw" (chiqim). student berilsa - tayinlangan
// (o'quvchi detail tabidan), aks holda o'quvchi tanlanadi (Depozitlar sahifasidan).
//
// "add" + tanlanadigan o'quvchi (fixedStudent emas) rejimida: o'quvchi tanlangach
// uning JORIY OYdagi guruhlari + qarzi chiqadi, qarzi bor guruh default belgilanadi,
// summa qarz bilan to'ldiriladi va to'lov aynan o'sha guruhga (StudentPayment) yoziladi
// (ortiqchasi keyingi oylarga/garovga o'tadi). Guruh yozuvi bo'lmasa yoki fixedStudent
// bo'lsa - eski garov (depozit) mantig'i ishlaydi.
const DepositFormModal = ({ mode = "add", student, close, setIsLoading }) => {
  const isWithdraw = mode === "withdraw";
  const fixedStudent = !!student?._id;
  // Guruhga yo'naltirilgan to'lov faqat sahifadan qo'shishda (kirim) ishlaydi.
  const groupMode = !isWithdraw && !fixedStudent;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth() + 1;

  const form = useObjectState({
    studentId: student?._id || "",
    paymentId: "",
    amount: "",
    method: "cash",
    paidAt: todayKey(),
    note: "",
    idemKey: crypto.randomUUID(),
  });

  const { data: studentsData } = useUsersListQuery(
    { role: ROLES.STUDENT, limit: 200 },
    { enabled: !fixedStudent },
  );
  const studentOptions = useMemo(
    () =>
      (studentsData?.data || []).map((s) => ({
        value: s._id,
        label: fullName(s),
      })),
    [studentsData],
  );

  // O'quvchining joriy oydagi guruh to'lovlari (qarz bilan).
  const { data: history, isLoading: historyLoading } = useStudentPaymentHistoryQuery(
    form.studentId,
    { enabled: groupMode && !!form.studentId },
  );
  const groupPayments = useMemo(() => {
    const items = history?.items || [];
    return items
      .filter((p) => p.year === curYear && p.month === curMonth && !p.writtenOff)
      .map((p) => ({
        ...p,
        remaining: Math.max(0, (p.expectedAmount || 0) - (p.paidAmount || 0)),
      }));
  }, [history, curYear, curMonth]);

  const groupOptions = useMemo(
    () =>
      groupPayments.map((p) => ({
        value: p._id,
        label: `${p.group?.name || "-"} — ${
          p.remaining > 0 ? `qarz ${formatMoney(p.remaining)}` : "to'langan"
        }`,
      })),
    [groupPayments],
  );

  // Ma'lumot kelganda: default sifatida qarzi bor guruh belgilanadi + summa
  // uning qarzi bilan to'ldiriladi. O'quvchi almashtirilsa - qayta hisoblanadi.
  useEffect(() => {
    if (!groupMode || !groupPayments.length) return;
    const chosen = groupPayments.find((p) => p.remaining > 0) || groupPayments[0];
    form.setFields({
      paymentId: chosen._id,
      amount: chosen.remaining > 0 ? String(chosen.remaining) : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupPayments, groupMode]);

  const onDone = () => {
    setIsLoading(false);
    close?.();
  };
  const onFail = () => setIsLoading(false);
  const topupMut = useDepositTopupMutation({ onSuccess: onDone, onError: onFail });
  const withdrawMut = useDepositWithdrawMutation({ onSuccess: onDone, onError: onFail });
  const addTxnMut = useAddTransactionMutation({ onSuccess: onDone, onError: onFail });

  const onStudentChange = (v) =>
    form.setFields({ studentId: v, paymentId: "", amount: "" });

  const onGroupChange = (pid) => {
    const p = groupPayments.find((g) => g._id === pid);
    form.setFields({
      paymentId: pid,
      amount: p && p.remaining > 0 ? String(p.remaining) : "",
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.studentId || !amount || amount <= 0) return;
    if (amount > MAX_AMOUNT) {
      toast.error(`Bir martada ${formatMoney(MAX_AMOUNT)} dan ko'p kiritib bo'lmaydi`);
      return;
    }
    setIsLoading(true);

    // Guruh tanlangan bo'lsa - to'lov aynan o'sha guruhga (StudentPayment) yoziladi.
    if (groupMode && form.paymentId) {
      addTxnMut.mutate({
        paymentId: form.paymentId,
        amount,
        method: form.method,
        paidAt: form.paidAt,
        idempotencyKey: form.idemKey,
      });
      return;
    }

    // Aks holda - garov (depozit) kirim/chiqimi.
    const body = {
      studentId: form.studentId,
      amount,
      method: form.method,
      paidAt: form.paidAt,
      note: form.note || undefined,
    };
    (isWithdraw ? withdrawMut : topupMut).mutate(body);
  };

  const pending = topupMut.isPending || withdrawMut.isPending || addTxnMut.isPending;
  const canSubmit = form.studentId && Number(form.amount) > 0;

  const selectedPayment = groupPayments.find((p) => p._id === form.paymentId);
  const remainingForSelected = selectedPayment?.remaining || 0;
  const overflow = Math.max(0, (Number(form.amount) || 0) - remainingForSelected);
  const studentChosen = !!form.studentId;

  return (
    <form onSubmit={submit} className="space-y-3">
      {fixedStudent ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">
          {fullName(student)}
        </div>
      ) : (
        <SelectField
          searchable
          label="O'quvchi"
          placeholder="O'quvchi tanlang..."
          value={form.studentId}
          onChange={onStudentChange}
          options={studentOptions}
        />
      )}

      {/* Guruh tanlash (faqat kirim + tanlanadigan o'quvchi) */}
      {groupMode && studentChosen && (
        <>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Guruhlar yuklanmoqda...</p>
          ) : groupPayments.length ? (
            <div className="space-y-1">
              <SelectField
                label="Guruh"
                placeholder="Guruh tanlang..."
                value={form.paymentId}
                onChange={onGroupChange}
                options={groupOptions}
              />
              <p className="text-xs text-muted-foreground">
                {remainingForSelected > 0 ? (
                  <>
                    To'lashi kerak:{" "}
                    <span className="font-medium text-red-600">
                      {formatMoney(remainingForSelected)}
                    </span>
                  </>
                ) : (
                  <span className="text-green-600">Bu guruh uchun qarz yo'q</span>
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Joriy oyda guruh to'lovi topilmadi — pul garovga qo'shiladi.
            </p>
          )}
        </>
      )}

      <InputField
        name="amount"
        type="money"
        label="Summa (so'm)"
        required
        placeholder="0"
        value={form.amount}
        onChange={(e) => form.setField("amount", e.target.value)}
      />
      {groupMode && form.paymentId && overflow > 0 && (
        <p className="text-xs text-muted-foreground">
          Ortig'i ({formatMoney(overflow)}) keyingi qoldiq oylarga, undan ortig'i esa
          garovga o'tadi.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Usul"
          value={form.method}
          onChange={(v) => form.setField("method", v)}
          options={METHODS}
        />
        <InputField
          name="paidAt"
          type="date"
          label="Sana"
          max={todayKey()}
          value={form.paidAt}
          onChange={(e) => form.setField("paidAt", e.target.value)}
        />
      </div>

      {/* Izoh faqat garov kirim/chiqimida saqlanadi */}
      {!(groupMode && form.paymentId) && (
        <InputField
          name="note"
          label="Izoh (ixtiyoriy)"
          value={form.note}
          onChange={(e) => form.setField("note", e.target.value)}
        />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => close?.()} disabled={pending}>
          Bekor qilish
        </Button>
        <Button
          type="submit"
          variant={isWithdraw ? "danger" : "default"}
          disabled={pending || !canSubmit}
        >
          {pending ? "Saqlanmoqda..." : isWithdraw ? "Qaytarish" : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default DepositFormModal;
