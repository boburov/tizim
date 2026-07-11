// Hooks
import useObjectState from "@/shared/hooks/useObjectState";

// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import InputField from "@/shared/components/ui/input/InputField";

// Hooks
import useUsersListQuery from "@/owner/features/users/hooks/useUsersListQuery";
import useGroupAddStudentMutation from "../../hooks/useGroupAddStudentMutation";

// Utils
import { todayInput, toDateInput } from "@/shared/utils/formatDate";

// Constants
import { ROLES } from "@/shared/constants/roles";

const GroupAddStudentModal = ({
  groupId,
  groupStartedAt,
  close,
  isLoading,
  setIsLoading,
}) => {
  // Default boshlash sanasi - guruh boshlangan sana (owner o'zgartira oladi).
  // leftAt (tugatgan sana) ixtiyoriy: bo'sh bo'lsa o'quvchi "o'qimoqda".
  const { studentId, joinedAt, leftAt, setField, resetState } = useObjectState({
    studentId: "",
    joinedAt: groupStartedAt ? toDateInput(groupStartedAt) : todayInput(),
    leftAt: "",
  });

  const { data, isLoading: loadingStudents } = useUsersListQuery({
    role: ROLES.STUDENT,
    limit: 200,
  });

  const students = data?.data || [];
  const options = students.map((s) => ({
    value: s._id,
    label: `${s.firstName} ${s.lastName} (@${s.username})`,
  }));

  const { mutate } = useGroupAddStudentMutation({
    onSuccess: () => {
      setIsLoading(false);
      resetState();
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // joinedAt majburiy - bo'sh bo'lsa yubormaymiz.
    if (!studentId || !joinedAt) return;
    setIsLoading(true);
    mutate({
      id: groupId,
      studentId,
      joinedAt,
      leftAt: leftAt || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectField
        searchable
        label="O'quvchi"
        placeholder="O'quvchini tanlang"
        emptyText="O'quvchilar topilmadi"
        value={studentId}
        onChange={(v) => setField("studentId", v)}
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
          disabled={isLoading || !studentId || !joinedAt}
          className="flex-1"
        >
          {isLoading ? "Qo'shilmoqda..." : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default GroupAddStudentModal;
