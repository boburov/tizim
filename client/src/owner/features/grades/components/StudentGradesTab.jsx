// Components
import Card from "@/shared/components/ui/card/Card";

// Hooks
import useStudentGradeSummaryQuery from "../hooks/useStudentGradeSummaryQuery";

// Utils
import { cn } from "@/shared/utils/cn";
import { getGradeColor } from "@/shared/helpers/grade.helpers";
import { formatDateUzLong } from "@/shared/utils/formatDate";

// O'quvchi profilidagi "Baholar" tab'i: o'rtacha ball + oxirgi ballar ro'yxati.
const StudentGradesTab = ({ studentId }) => {
  const { data, isLoading } = useStudentGradeSummaryQuery(studentId);

  const average = data?.average ?? null;
  const recent = data?.recent || [];

  return (
    <div className="space-y-4 pt-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <p className="text-xs text-muted-foreground">O'rtacha ball</p>
          <p
            className={cn(
              "text-2xl font-semibold",
              average == null
                ? "text-gray-400"
                : average >= 4
                  ? "text-green-600"
                  : average >= 3
                    ? "text-amber-600"
                    : "text-rose-600",
            )}
          >
            {average == null ? "-" : `${average} / 5`}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground">Jami baholar</p>
          <p className="text-2xl font-semibold text-gray-700">
            {data?.count || 0}
          </p>
        </Card>
      </div>

      <Card title="Oxirgi baholar">
        {isLoading ? (
          <p className="py-4 text-sm text-muted-foreground">Yuklanmoqda...</p>
        ) : recent.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Hali baho qo'yilmagan
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((g) => (
              <li
                key={g._id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">{g.group?.name || "-"}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateUzLong(g.dateKey)}
                    {g.comment ? ` · ${g.comment}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex size-8 items-center justify-center rounded-md border text-sm font-semibold",
                    getGradeColor(g.value),
                  )}
                >
                  {g.value}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default StudentGradesTab;
