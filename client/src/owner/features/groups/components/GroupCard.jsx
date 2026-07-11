// Router
import { Link } from "react-router-dom";

// Components
import Card from "@/shared/components/ui/card/Card";

// Utils
import { sortSchedule, DAY_LABELS_UZ } from "@/shared/utils/formatSchedule";
import { formatMoney } from "@/shared/utils/formatMoney";
import { formatDateUzLong } from "@/shared/utils/formatDate";

const GroupCard = ({ group, archived = false }) => {
  const teachers = (group.teachers || [])
    .map((t) => `${t.firstName} ${t.lastName || ""}`.trim())
    .join(", ");

  const schedule = sortSchedule(group.schedule);

  return (
    <Link to={`/owner/groups/${group._id}`} className="block group">
      <Card className="h-full flex flex-col gap-3 transition-colors group-hover:border-primary">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-base">{group.name}</h3>
        </div>

        <div className="text-sm text-muted-foreground space-y-2">
          <div className="space-y-1.5">
            {schedule.length ? (
              <div className="flex flex-wrap gap-1.5">
                {schedule.map((s, i) => (
                  <span
                    key={`${s.day}-${i}`}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-xs"
                  >
                    <span className="font-medium text-foreground">
                      {DAY_LABELS_UZ[s.day] || s.day}
                    </span>
                    <span>
                      {s.startTime}–{s.endTime}
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <span> -</span>
            )}
          </div>

          <div>
            <span className="font-medium text-foreground">O'qituvchi:</span>{" "}
            {teachers || "-"}
          </div>

          <div>
            <span className="font-medium text-foreground">O'quvchilar:</span>{" "}
            {group.studentsCount || 0} ta
          </div>

          <div>
            <span className="font-medium text-foreground">Oylik to'lov:</span>{" "}
            {group.monthlyFee != null ? (
              formatMoney(group.monthlyFee)
            ) : (
              <span className="text-amber-600">Belgilanmagan</span>
            )}
          </div>

          {archived && (
            <div className="pt-1 mt-1 border-t space-y-0.5">
              <div>
                <span className="font-medium text-foreground">Boshlagan:</span>{" "}
                {formatDateUzLong(group.startDate || group.createdAt)}
              </div>
              {group.endDate && (
                <div>
                  <span className="font-medium text-foreground">Tugagan:</span>{" "}
                  {formatDateUzLong(group.endDate)}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
};

export default GroupCard;
