import { useMemo } from "react";
import InputField from "@/shared/components/ui/input/InputField";
import SelectField from "@/shared/components/ui/select/SelectField";
import Button from "@/shared/components/ui/button/Button";
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupsListQuery from "@/owner/features/groups/hooks/useGroupsListQuery";
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import MonthPicker from "../MonthPicker";
import { useDiscountCreateMutation } from "../../hooks/useFinanceMutations";

const TYPE_OPTIONS = [
  { value: "percent", label: "Foiz (%)" },
  { value: "fixed", label: "Aniq summa (so'm)" },
];
const SCOPE_OPTIONS = [
  { value: "permanent", label: "Doimiy" },
  { value: "monthly", label: "Bitta oy uchun" },
];

const DiscountCreateModal = ({ close, setIsLoading }) => {
  const now = new Date();
  const form = useObjectState({
    student: "",
    group: "",
    type: "percent",
    value: "",
    scope: "permanent",
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    reason: "",
  });

  const { data: groupsData } = useGroupsListQuery({ limit: 200 });
  const { data: studentsData } = useUsersListQuery({ role: "student", limit: 200 });

  const groupOptions = useMemo(
    () => (groupsData?.data || []).map((g) => ({ value: g._id, label: g.name })),
    [groupsData],
  );
  const studentOptions = useMemo(
    () =>
      (studentsData?.data || []).map((s) => ({
        value: s._id,
        label: `${s.firstName} ${s.lastName}`,
      })),
    [studentsData],
  );

  const mut = useDiscountCreateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.student || !form.group || !form.value) return;
    setIsLoading(true);
    mut.mutate({
      student: form.student,
      group: form.group,
      type: form.type,
      value: Number(form.value),
      scope: form.scope,
      year: form.scope === "monthly" ? Number(form.year) : undefined,
      month: form.scope === "monthly" ? Number(form.month) : undefined,
      reason: form.reason || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <SelectField
        searchable
        label="O'quvchi"
        required
        placeholder="O'quvchini tanlang"
        value={form.student}
        onChange={(v) => form.setField("student", v)}
        options={studentOptions}
      />
      <SelectField
        searchable
        label="Guruh"
        required
        placeholder="Guruhni tanlang"
        value={form.group}
        onChange={(v) => form.setField("group", v)}
        options={groupOptions}
      />
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
          placeholder="0"
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
        placeholder="Masalan: ijtimoiy chegirma"
        value={form.reason}
        onChange={(e) => form.setField("reason", e.target.value)}
      />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={() => close?.()}>
          Bekor qilish
        </Button>
        <Button type="submit" disabled={mut.isPending}>
          Qo'shish
        </Button>
      </div>
    </form>
  );
};

export default DiscountCreateModal;
