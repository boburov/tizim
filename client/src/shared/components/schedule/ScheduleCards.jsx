import { Clock } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { groupScheduleByTime } from "@/shared/utils/formatSchedule";

// Dars jadvalini vaqt bo'yicha guruhlangan, border bilan o'ralgan kartalarga ajratadi.
// Betartib "Du 14:00, Se 14:00, ..." o'rniga: har vaqt uchun bitta karta + kun chiplari.
const ScheduleCards = ({ schedule = [], className = "", emptyText = "Dars jadvali belgilanmagan" }) => {
  const groups = groupScheduleByTime(schedule);

  if (!groups.length) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {groups.map((g) => (
        <div
          key={g.time}
          className="min-w-[120px] flex-1 rounded-xl border border-border/70 bg-white p-3 shadow-sm sm:flex-none"
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Clock className="size-3.5 text-primary" />
            {g.time}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {g.days.map((d) => (
              <span
                key={d}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ScheduleCards;
