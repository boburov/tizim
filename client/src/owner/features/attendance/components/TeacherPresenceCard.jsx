// Components
import Card from "@/shared/components/ui/card/Card";
import Switch from "@/shared/components/ui/switch/Switch";

// Hooks
import useTeacherAttendanceQuery from "../hooks/useTeacherAttendanceQuery";
import useTeacherAttendanceMutation from "../hooks/useTeacherAttendanceMutation";

const TeacherPresenceCard = ({ groupId, date }) => {
  const { data: status, isLoading } = useTeacherAttendanceQuery(groupId, date);
  const { mutate, isPending } = useTeacherAttendanceMutation();

  // Dars kuni bo'lmasa yoki ma'lumot yo'q bo'lsa ko'rsatmaymiz
  if (!groupId || !date || isLoading || !status || !status.isClassDay) {
    return null;
  }

  const present = status.present;

  return (
    <Card className="flex items-center justify-between gap-4">
      <p className="font-medium">O'qituvchi darsga keldimi?</p>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className={
            present
              ? "text-sm font-medium text-emerald-600"
              : "text-sm font-medium text-rose-500"
          }
        >
          {present ? "Keldi" : "Kelmadi"}
        </span>
        <Switch
          checked={present}
          onChange={(checked) => mutate({ groupId, date, present: checked })}
          disabled={isPending}
        />
      </div>
    </Card>
  );
};

export default TeacherPresenceCard;
