import { Clock } from "lucide-react";
import { groupScheduleByTime } from "@/shared/utils/formatSchedule";

// Guruh jadvalini bir xil vaqtli kunlarni birlashtirib, toza ko'rinishda chiqaradi
const GroupScheduleLines = ({ schedule = [] }) => {
  const groups = groupScheduleByTime(schedule);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Jadval kiritilmagan</p>;
  }

  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <div key={g.time} className="flex items-center gap-2 text-sm">
          <Clock className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="flex flex-wrap items-center gap-1">
            {g.days.map((d) => (
              <span
                key={d}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/70"
              >
                {d}
              </span>
            ))}
            <span className="ml-0.5 font-medium text-foreground/80">
              {g.time}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default GroupScheduleLines;
