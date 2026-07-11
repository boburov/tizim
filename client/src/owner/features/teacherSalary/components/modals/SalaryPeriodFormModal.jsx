import { useMemo } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import { ROLES } from "@/shared/constants/roles";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import {
  useTeacherPeriodCreateMutation,
  useTeacherPeriodUpdateMutation,
} from "@/owner/features/groups";

const TYPE_OPTIONS = [
  { value: "fixed", label: "Fiksa (aniq summa)" },
  { value: "percent", label: "Foiz (guruh tushumidan)" },
  { value: "mixed", label: "Aralash (fiksa + foiz)" },
];

const dateKey = (v) => (v ? String(v).slice(0, 10) : "");
const fullName = (t) => `${t?.firstName || ""} ${t?.lastName || ""}`.trim() || "-";

// groupId + (ixtiyoriy) period - ModalWrapper data orqali uzatiladi.
// period bo'lsa - tahrirlash, bo'lmasa - yangi davr qo'shish.
const SalaryPeriodFormModal = ({ groupId, period, close, setIsLoading }) => {
  const isEdit = !!period?._id;

  const form = useObjectState({
    teacher: period?.teacher?._id || period?.teacher || "",
    startDate: dateKey(period?.startDate),
    endDate: dateKey(period?.endDate),
    salaryType: period?.salaryType || "fixed",
    fixedAmount: period?.fixedAmount ? String(period.fixedAmount) : "",
    percentRate: period?.percentRate ? String(period.percentRate) : "",
  });

  // O'qituvchilar - faqat yangi davr qo'shishda kerak.
  const { data: teachersData } = useUsersListQuery({ role: ROLES.TEACHER, limit: 200 }, { enabled: !isEdit });
  const teacherOptions = useMemo(
    () =>
      (teachersData?.data || []).map((t) => ({
        value: t._id,
        label: `${t.firstName} ${t.lastName || ""}`.trim(),
      })),
    [teachersData],
  );

  const onDone = () => {
    setIsLoading(false);
    close?.();
  };
  const onFail = () => setIsLoading(false);

  const createMut = useTeacherPeriodCreateMutation(groupId, { onSuccess: onDone, onError: onFail });
  const updateMut = useTeacherPeriodUpdateMutation(groupId, { onSuccess: onDone, onError: onFail });

  const showFixed = form.salaryType === "fixed" || form.salaryType === "mixed";
  const showPercent = form.salaryType === "percent" || form.salaryType === "mixed";

  const submit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    const rate = {
      salaryType: form.salaryType,
      fixedAmount: Number(form.fixedAmount) || 0,
      percentRate: Number(form.percentRate) || 0,
    };
    if (isEdit) {
      updateMut.mutate({
        id: period._id,
        body: { startDate: form.startDate, endDate: form.endDate || null, ...rate },
      });
    } else {
      createMut.mutate({
        teacher: form.teacher,
        startDate: form.startDate,
        endDate: form.endDate || null,
        ...rate,
      });
    }
  };

  const pending = createMut.isPending || updateMut.isPending;
  const canSubmit = form.startDate && (isEdit || form.teacher);

  return (
    <form onSubmit={submit} className="space-y-3">
      {isEdit ? (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm font-medium">
          {fullName(period.teacher)}
        </div>
      ) : (
        <SelectField
          searchable
          label="O'qituvchi"
          placeholder="O'qituvchi tanlang..."
          value={form.teacher}
          onChange={(v) => form.setField("teacher", v)}
          options={teacherOptions}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <InputField
          name="startDate"
          type="date"
          label="Boshlanish sanasi"
          required
          value={form.startDate}
          onChange={(e) => form.setField("startDate", e.target.value)}
        />
        <InputField
          name="endDate"
          type="date"
          label="Tugash sanasi"
          value={form.endDate}
          onChange={(e) => form.setField("endDate", e.target.value)}
        />
      </div>

      <SelectField
        label="Maosh turi"
        value={form.salaryType}
        onChange={(v) => form.setField("salaryType", v)}
        options={TYPE_OPTIONS}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {showFixed && (
          <InputField
            name="fixedAmount"
            type="money"
            label="Fiksa (so'm)"
            placeholder="0"
            value={form.fixedAmount}
            onChange={(e) => form.setField("fixedAmount", e.target.value)}
          />
        )}
        {showPercent && (
          <InputField
            name="percentRate"
            type="number"
            label="Foiz (%)"
            placeholder="0"
            value={form.percentRate}
            onChange={(e) => form.setField("percentRate", e.target.value)}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => close?.()} disabled={pending}>
          Bekor qilish
        </Button>
        <Button type="submit" disabled={pending || !canSubmit}>
          {pending ? "Saqlanmoqda..." : "Saqlash"}
        </Button>
      </div>
    </form>
  );
};

export default SalaryPeriodFormModal;
