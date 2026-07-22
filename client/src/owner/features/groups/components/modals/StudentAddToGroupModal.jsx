// O'quvchi detail sahifasi uchun: o'quvchi belgilangan, GURUH tanlanadi.
// (Guruh detaildagi GroupAddStudentModal'dan farqi - u yerda o'quvchi tanlanadi.)
import { useQueryClient } from "@tanstack/react-query";

// Hooks
import useObjectState from "@/shared/hooks/useObjectState";
import useGroupsListQuery from "../../hooks/useGroupsListQuery";
import useGroupAddStudentMutation from "../../hooks/useGroupAddStudentMutation";

// Components
import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import InputField from "@/shared/components/ui/input/InputField";

// Utils
import { todayInput, toDateInput } from "@/shared/utils/formatDate";
import { qk } from "@/shared/lib/query/keys";

const StudentAddToGroupModal = ({
  studentId,
  enrolledAt,
  excludeGroupIds = [],
  close,
  isLoading,
  setIsLoading,
}) => {
  const qc = useQueryClient();

  // leftAt (tugatgan sana) ixtiyoriy: bo'sh bo'lsa o'quvchi "o'qimoqda".
  const { groupId, joinedAt, leftAt, setField, setFields, resetState } =
    useObjectState({
      groupId: "",
      joinedAt: todayInput(),
      leftAt: "",
    });

  // Faqat aktiv guruhlar (list default'i isActive: true qaytaradi).
  const { data, isLoading: loadingGroups } = useGroupsListQuery({ limit: 200 });

  const groups = data?.data || [];
  const excluded = new Set(excludeGroupIds.map(String));
  const available = groups.filter((g) => !excluded.has(String(g._id)));
  const options = available.map((g) => ({ value: g._id, label: g.name }));

  // Boshlash sanasi guruh boshlangan sanadan HAM, o'quvchi ro'yxatga olingan
  // sanadan HAM oldin bo'lmasin (min = ikkalasining kechrog'i). Aks holda
  // "10-iyulda ro'yxatga olingan, 1-iyuldan o'qiyapti" degan holat chiqadi.
  const selectedGroup = available.find(
    (g) => String(g._id) === String(groupId),
  );
  const enrolledInput = enrolledAt ? toDateInput(enrolledAt) : undefined;
  const groupStartInput = selectedGroup?.startDate
    ? toDateInput(selectedGroup.startDate)
    : undefined;
  // ISO (YYYY-MM-DD) formatda string solishtiruvi sana solishtiruviga teng.
  const joinMin =
    [groupStartInput, enrolledInput].filter(Boolean).sort().pop() || undefined;

  // Guruh tanlanganda boshlash sanasini shu eng erta ruxsat etilgan sanaga
  // moslaymiz (guruh o'quvchidan oldin boshlangan bo'lsa - ro'yxat sanasi).
  const onSelectGroup = (v) => {
    const g = available.find((x) => String(x._id) === String(v));
    const gStart = g?.startDate ? toDateInput(g.startDate) : undefined;
    const earliest =
      [gStart, enrolledInput].filter(Boolean).sort().pop() || todayInput();
    setFields({ groupId: v, joinedAt: earliest });
  };

  const { mutate } = useGroupAddStudentMutation({
    onSuccess: () => {
      // O'quvchi detail (activeGroups) va moliya yangilanishi kerak.
      qc.invalidateQueries({ queryKey: qk.users.one(studentId) });
      qc.invalidateQueries({ queryKey: qk.finance.all() });
      setIsLoading(false);
      resetState();
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!groupId || !joinedAt) return;
    setIsLoading(true);
    mutate({ id: groupId, studentId, joinedAt, leftAt: leftAt || undefined });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SelectField
        searchable
        label="Guruh"
        placeholder="Guruhni tanlang"
        emptyText="Guruh topilmadi"
        value={groupId}
        onChange={onSelectGroup}
        options={options}
        isLoading={loadingGroups}
        required
        disabled={isLoading}
      />

      <InputField
        type="date"
        name="joinedAt"
        label="Boshlash sanasi"
        value={joinedAt}
        min={joinMin}
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
          disabled={isLoading || !groupId || !joinedAt}
          className="flex-1"
        >
          {isLoading ? "Qo'shilmoqda..." : "Qo'shish"}
        </Button>
      </div>
    </form>
  );
};

export default StudentAddToGroupModal;
