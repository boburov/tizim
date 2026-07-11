import { useMemo } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import { ROLES } from "@/shared/constants/roles";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import {
  useDepositTopupMutation,
  useDepositWithdrawMutation,
} from "../../hooks/useDepositMutations";

const METHODS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta" },
];
const todayKey = () => new Date().toISOString().slice(0, 10);
const fullName = (s) => `${s?.firstName || ""} ${s?.lastName || ""}`.trim() || "-";

// mode: "add" (kirim) yoki "withdraw" (chiqim). student berilsa - tayinlangan
// (o'quvchi detail tabidan), aks holda o'quvchi tanlanadi (Depozitlar sahifasidan).
const DepositFormModal = ({ mode = "add", student, close, setIsLoading }) => {
  const isWithdraw = mode === "withdraw";
  const fixedStudent = !!student?._id;

  const form = useObjectState({
    studentId: student?._id || "",
    amount: "",
    method: "cash",
    paidAt: todayKey(),
    note: "",
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

  const onDone = () => {
    setIsLoading(false);
    close?.();
  };
  const onFail = () => setIsLoading(false);
  const topupMut = useDepositTopupMutation({ onSuccess: onDone, onError: onFail });
  const withdrawMut = useDepositWithdrawMutation({ onSuccess: onDone, onError: onFail });

  const submit = (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.studentId || !amount || amount <= 0) return;
    setIsLoading(true);
    const body = {
      studentId: form.studentId,
      amount,
      method: form.method,
      paidAt: form.paidAt,
      note: form.note || undefined,
    };
    (isWithdraw ? withdrawMut : topupMut).mutate(body);
  };

  const pending = topupMut.isPending || withdrawMut.isPending;
  const canSubmit = form.studentId && Number(form.amount) > 0;

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
          onChange={(v) => form.setField("studentId", v)}
          options={studentOptions}
        />
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

      <InputField
        name="note"
        label="Izoh (ixtiyoriy)"
        value={form.note}
        onChange={(e) => form.setField("note", e.target.value)}
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => close?.()} disabled={pending}>
          Bekor qilish
        </Button>
        <Button type="submit" variant={isWithdraw ? "danger" : "default"} disabled={pending || !canSubmit}>
          {pending ? "Saqlanmoqda..." : isWithdraw ? "Yechib olish" : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default DepositFormModal;
