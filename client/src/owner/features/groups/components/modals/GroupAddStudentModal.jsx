// Icons
import { AlertTriangle } from "lucide-react";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";

// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import useGroupAddStudentsBulkMutation from "../../hooks/useGroupAddStudentsBulkMutation";

// Utils
import { todayInput, toDateInput } from "@/shared/utils/formatDate";

// Constants
import { ROLES } from "@/shared/constants/roles";

const GroupAddStudentModal = ({
  groupId,
  groupStartedAt,
  existingStudentIds = [],
  close,
  isLoading,
  setIsLoading,
}) => {
  // Default boshlash sanasi - guruh boshlangan sana (owner o'zgartira oladi).
  // leftAt (tugatgan sana) ixtiyoriy: bo'sh bo'lsa o'quvchi "o'qimoqda".
  // conflicts - dars to'qnashuvi tasdiq oynasi uchun (bo'sh bo'lsa forma ko'rinadi).
  const { studentIds, joinedAt, leftAt, conflicts, setField, resetState } =
    useObjectState({
      studentIds: [],
      joinedAt: groupStartedAt ? toDateInput(groupStartedAt) : todayInput(),
      leftAt: "",
      conflicts: [],
    });

  const { data, isLoading: loadingStudents } = useUsersListQuery({
    role: ROLES.STUDENT,
    limit: 200,
  });

  // Guruhda allaqachon bor o'quvchilar tanlov ro'yxatida ko'rinmaydi.
  const existingSet = new Set((existingStudentIds || []).map(String));
  const students = data?.data || [];
  const options = students
    .filter((s) => !existingSet.has(String(s._id)))
    .map((s) => ({
      value: s._id,
      label: `${s.firstName} ${s.lastName} (@${s.username})`,
    }));

  const { mutate } = useGroupAddStudentsBulkMutation({
    onSuccess: (res) => {
      setIsLoading(false);
      // Dars to'qnashuvi topildi - tasdiq oynasini ko'rsatamiz.
      if (res?.requiresConfirmation) {
        setField("conflicts", res.conflicts || []);
        return;
      }
      resetState();
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const submit = (force) => {
    if (!studentIds.length || !joinedAt) return;
    setIsLoading(true);
    mutate({
      id: groupId,
      studentIds,
      joinedAt,
      leftAt: leftAt || undefined,
      force,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    submit(false);
  };

  // ── Dars to'qnashuvi tasdiq oynasi ──
  if (conflicts.length) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-md bg-amber-50 p-3 text-amber-800">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm">
            Quyidagi o'quvchilarning shu kun va soatda boshqa guruhda darsi bor.
            Baribir qo'shasizmi?
          </p>
        </div>

        <ul className="max-h-64 space-y-2 overflow-y-auto hidden-scroll">
          {conflicts.map((c) => (
            <li
              key={c.studentId}
              className="rounded-md border border-gray-200 p-2.5 text-sm"
            >
              <p className="font-medium text-black">{c.studentName}</p>
              <ul className="mt-1 space-y-0.5 text-gray-600">
                {c.conflicts.map((x, i) => (
                  <li key={i}>
                    {x.groupName} — {x.dayLabel} {x.startTime}-{x.endTime}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setField("conflicts", [])}
            disabled={isLoading}
            className="flex-1"
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            onClick={() => submit(true)}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? "Qo'shilmoqda..." : "Baribir qo'shish"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Asosiy forma ──
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectField
        multiple
        label="O'quvchilar"
        placeholder="O'quvchilarni tanlang"
        emptyText="O'quvchilar topilmadi"
        value={studentIds}
        onChange={(v) => setField("studentIds", v)}
        options={options}
        isLoading={loadingStudents}
        required
        disabled={isLoading}
      />

      <InputField
        type="date"
        name="joinedAt"
        label="Boshlash sanasi"
        value={joinedAt}
        max={joinedAt > todayInput() ? joinedAt : todayInput()}
        onChange={(e) => setField("joinedAt", e.target.value)}
        disabled={isLoading}
        required
      />

      <InputField
        type="date"
        name="leftAt"
        label="Tugatgan sana (ixtiyoriy)"
        description="Bo'sh qoldirilsa o'quvchi hali o'qiyapti deb hisoblanadi."
        value={leftAt}
        min={joinedAt || undefined}
        max={todayInput()}
        onChange={(e) => setField("leftAt", e.target.value)}
        disabled={isLoading}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => close?.()}
          disabled={isLoading}
          className="flex-1"
        >
          Bekor qilish
        </Button>
        <Button
          type="submit"
          disabled={isLoading || !studentIds.length || !joinedAt}
          className="flex-1"
        >
          {isLoading ? "Qo'shilmoqda..." : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default GroupAddStudentModal;
