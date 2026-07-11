import { Save, RotateCcw } from "lucide-react";
import useObjectState from "@/shared/hooks/useObjectState";
import Button from "@/shared/components/ui/button/Button";
import InputField from "@/shared/components/ui/input/InputField";
import { cn } from "@/shared/utils/cn";
import { toDateInput } from "@/shared/utils/formatDate";
import useTeacherAttendanceQuery from "../hooks/useTeacherAttendanceQuery";
import useTeacherAttendanceBulkMutation from "../hooks/useTeacherAttendanceBulkMutation";

const STATUS_OPTIONS = [
  {
    value: "present",
    label: "Keldi",
    active: "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300",
  },
  {
    value: "absent",
    label: "Kelmadi",
    active: "bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-300",
  },
  {
    value: "excused",
    label: "Sababli",
    active: "bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-300",
  },
];

const StatusToggle = ({ value, onChange, onClear, disabled }) => (
  <div className="inline-flex items-center gap-2">
    <div className="inline-flex overflow-hidden rounded-md border">
      {STATUS_OPTIONS.map((o, i) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "px-3 py-1.5 text-sm transition disabled:opacity-50",
            i > 0 && "border-l",
            value === o.value
              ? o.active
              : "bg-white text-muted-foreground hover:bg-accent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
    {value !== "present" && (
      <button
        type="button"
        disabled={disabled}
        onClick={onClear}
        title="Bekor qilish (Keldi holatiga qaytarish)"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition hover:bg-accent disabled:opacity-50"
      >
        <RotateCcw className="size-3.5" />
        Bekor qilish
      </button>
    )}
  </div>
);

const TeacherAttendancePage = () => {
  const obj = useObjectState({
    date: toDateInput(new Date()),
    overrides: {},
  });

  const { data, isLoading } = useTeacherAttendanceQuery(obj.date);
  const rows = data?.rows || [];

  const { mutate, isPending } = useTeacherAttendanceBulkMutation({
    onSuccess: () => obj.setField("overrides", {}),
  });

  const today = toDateInput(new Date());

  const statusOf = (row) => obj.overrides[row.teacher._id] ?? row.status;

  const setStatus = (teacherId, status) =>
    obj.setField("overrides", { ...obj.overrides, [teacherId]: status });

  const absentCount = rows.filter((r) => statusOf(r) === "absent").length;
  const excusedCount = rows.filter((r) => statusOf(r) === "excused").length;

  const handleSave = () => {
    const items = rows.map((r) => ({
      teacherId: r.teacher._id,
      status: statusOf(r),
    }));
    if (!items.length) return;
    mutate({ date: obj.date, items });
  };

  return (
    <div className="space-y-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">O'qituvchilar davomati</h1>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-[170px]">
            <InputField
              type="date"
              name="date"
              label="Sana"
              value={obj.date}
              max={today}
              onChange={(e) =>
                obj.setFields({ date: e.target.value, overrides: {} })
              }
            />
          </div>
          <Button onClick={handleSave} disabled={isPending || !rows.length}>
            <Save className="size-4" />
            {isPending ? "Saqlanmoqda..." : "Saqlash"}
          </Button>
        </div>
      </header>

      {(absentCount > 0 || excusedCount > 0) && (
        <p className="text-sm text-muted-foreground">
          Kelmadi: <b className="text-rose-600">{absentCount}</b> · Sababli:{" "}
          <b className="text-amber-600">{excusedCount}</b>
        </p>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : !rows.length ? (
        <div className="rounded-md border p-8 text-center text-muted-foreground">
          Faol o'qituvchilar topilmadi
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">O'qituvchi</th>
                <th className="px-3 py-2">Holat</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.teacher._id} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    {r.teacher.firstName} {r.teacher.lastName}
                  </td>
                  <td className="px-3 py-2">
                    <StatusToggle
                      value={statusOf(r)}
                      onChange={(s) => setStatus(r.teacher._id, s)}
                      onClear={() => setStatus(r.teacher._id, "present")}
                      disabled={isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TeacherAttendancePage;
