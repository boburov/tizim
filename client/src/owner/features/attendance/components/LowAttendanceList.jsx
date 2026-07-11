import { Link } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";

// Davomat darajasiga qarab yumshoq rang
const rateTone = (rate) => {
  if (rate === null || rate === undefined) return "bg-slate-100 text-slate-500";
  if (rate < 25) return "bg-rose-50 text-rose-600";
  if (rate < 45) return "bg-orange-50 text-orange-600";
  return "bg-amber-50 text-amber-700";
};

const LowAttendanceList = ({ items = [], threshold }) => (
  <Card>
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold">Past davomatli o'quvchilar</h3>
      <span className="text-xs text-muted-foreground">
        Threshold: {threshold}%
      </span>
    </div>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">
        Past davomatli o'quvchilar yo'q
      </p>
    ) : (
      <ol className="space-y-0.5">
        {items.map((s, i) => (
          <li
            key={s.student._id}
            className="flex items-center justify-between gap-3 text-sm rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-muted-foreground tabular-nums w-5 text-right">
                {i + 1}.
              </span>
              <Link
                to={`/owner/users/${s.student._id}`}
                className="font-medium hover:underline truncate"
              >
                {s.student.firstName} {s.student.lastName}
              </Link>
            </span>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${rateTone(
                s.rate,
              )}`}
            >
              {s.rate !== null ? `${s.rate}%` : "-"}
            </span>
          </li>
        ))}
      </ol>
    )}
  </Card>
);

export default LowAttendanceList;
