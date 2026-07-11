// Router
import { Link } from "react-router-dom";

// Icons
import { ChevronRight } from "lucide-react";

// Components
import Card from "@/shared/components/ui/card/Card";
import GroupStatsPanel from "../GroupStatsPanel";
import GroupHistoryList from "../GroupHistoryList";

// Utils
import { DAY_LABELS_FULL_UZ, sortSchedule } from "@/shared/utils/formatSchedule";
import { formatDateUz } from "@/shared/utils/formatDate";

// Guruh "Ma'lumot" tab'i: O'qituvchilar, Dars jadvali + statistika
// (Davomat, Baho) kartalari. Avval sahifa boshida turardi, endi tab ichida.
// O'qituvchini belgilash/almashtirish endi "Maosh belgilash" sahifasida
// davrlar (TeacherGroupPeriod) orqali - bu yerda faqat ko'rsatiladi.
const GroupInfoTab = ({ group }) => {
  const teachers = group.teachers || [];

  return (
    <div className="space-y-4 pt-3">
      {(group.startDate || group.endDate || group.durationMonths) && (
        <p className="text-sm text-muted-foreground">
          {group.startDate && `Boshlanish: ${formatDateUz(group.startDate)}`}
          {group.startDate && group.endDate ? " · " : ""}
          {group.endDate ? `Tugash: ${formatDateUz(group.endDate)}` : ""}
          {(group.startDate || group.endDate) && group.durationMonths ? " · " : ""}
          {group.durationMonths ? `Davomiylik: ${group.durationMonths} oy` : ""}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs text-muted-foreground mb-2">O'qituvchi</p>
          {teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tayinlanmagan</p>
          ) : (
            <div className="space-y-1">
              {teachers.map((t) => (
                <Link
                  key={t._id}
                  to={`/owner/users/${t._id}`}
                  className="group/teacher flex min-w-0 items-center gap-1 font-medium text-foreground transition-colors hover:text-primary"
                  title="O'qituvchi detaliga o'tish"
                >
                  <span className="truncate">
                    {t.firstName} {t.lastName || ""}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/teacher:translate-x-0.5 group-hover/teacher:text-primary" />
                </Link>
              ))}
            </div>
          )}
        </Card>
        <Card>
          <p className="text-xs text-muted-foreground mb-2">Dars jadvali</p>
          {!group.schedule || group.schedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">-</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortSchedule(group.schedule).map((s, i) => (
                <div
                  key={`${s.day}-${i}`}
                  className="flex flex-col items-start gap-0.5 rounded-md border bg-muted/40 px-3 py-1.5"
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    {DAY_LABELS_FULL_UZ[s.day] || s.day}
                  </span>
                  <span className="text-sm font-medium">
                    {s.startTime}–{s.endTime}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <GroupStatsPanel groupId={group._id} />

      <details className="group/details border rounded-sm bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground select-none">
          Tarix (a'zolik o'zgarishlari)
        </summary>
        <div className="p-3 pt-0">
          <GroupHistoryList groupId={group._id} />
        </div>
      </details>
    </div>
  );
};

export default GroupInfoTab;
