import { useMemo, useState } from "react";

import Button from "@/shared/components/ui/button/Button";
import SelectField from "@/shared/components/ui/select/SelectField";
import useGroupUpdateMutation from "../../hooks/useGroupUpdateMutation";
import useAvailableTeachersQuery from "../../hooks/useAvailableTeachersQuery";

// Guruhga o'qituvchi biriktirish / almashtirish.
// - Guruhda o'qituvchi bo'lmasa: "Biriktirish".
// - Bor bo'lsa: "Almashtirish" (eski o'qituvchi bugundan chiqariladi, yangisi qo'shiladi).
// Server jadval to'qnashuvini tekshiradi - yangi o'qituvchi o'sha kun/vaqtlarda
// bo'sh bo'lishi shart. `group` ModalWrapper data orqali keladi.
const GroupAssignTeacherModal = ({ group, close, isLoading, setIsLoading }) => {
  const current = (group?.teachers || [])[0];
  const currentId = current
    ? typeof current === "string"
      ? current
      : current._id
    : "";
  const isReplace = Boolean(currentId);

  const [teacher, setTeacher] = useState("");

  // Faqat guruh jadvalidagi vaqtlarda BO'SH o'qituvchilar (band bo'lganlar chiqmaydi).
  const { data: available, isLoading: loadingTeachers } =
    useAvailableTeachersQuery(group?._id);
  const teacherOptions = useMemo(
    () =>
      (available || [])
        .filter((t) => t._id !== currentId)
        .map((t) => ({
          value: t._id,
          label: `${t.firstName} ${t.lastName || ""}`.trim(),
        })),
    [available, currentId],
  );

  const { mutate } = useGroupUpdateMutation({
    onSuccess: () => {
      setIsLoading(false);
      close?.();
    },
    onError: () => setIsLoading(false),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!teacher) return;
    // O'sha o'qituvchi tanlansa - o'zgarish yo'q.
    if (teacher === currentId) {
      close?.();
      return;
    }
    setIsLoading(true);
    mutate({ id: group._id, body: { teachers: [teacher] } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isReplace && current && (
        <p className="text-sm text-muted-foreground">
          Hozirgi o'qituvchi:{" "}
          <span className="font-medium text-foreground">
            {current.firstName} {current.lastName || ""}
          </span>
          . Yangisi tanlansa, eski o'qituvchi bugundan guruhdan chiqariladi.
        </p>
      )}

      <SelectField
        searchable
        required
        label="O'qituvchi"
        value={teacher}
        onChange={setTeacher}
        options={teacherOptions}
        placeholder={
          loadingTeachers ? "Yuklanmoqda..." : "Bo'sh o'qituvchini tanlang"
        }
        searchPlaceholder="O'qituvchi qidirish..."
        emptyText="Bu vaqtlarda bo'sh o'qituvchi yo'q"
        disabled={isLoading || loadingTeachers}
      />

      <p className="text-xs text-muted-foreground">
        Ro'yxatda faqat guruh jadvalidagi kun/vaqtlarda bo'sh o'qituvchilar
        ko'rinadi. Maosh stavkasi "O'qituvchi maoshlari" sahifasida belgilanadi.
      </p>

      <div className="flex gap-2 pt-1">
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
          disabled={isLoading || !teacher}
          className="flex-1"
        >
          {isLoading
            ? "Saqlanmoqda..."
            : isReplace
              ? "Almashtirish"
              : "Biriktirish"}
        </Button>
      </div>
    </form>
  );
};

export default GroupAssignTeacherModal;
