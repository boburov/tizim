// Icons
import { Crown } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";

// Top-3 medal uslubi (oltin/kumush/bronza), qolgani neytral.
const RANK_STYLE = {
  1: { badge: "bg-amber-400 text-white", bar: "bg-amber-400", ring: "ring-amber-200" },
  2: { badge: "bg-slate-400 text-white", bar: "bg-slate-400", ring: "ring-slate-200" },
  3: { badge: "bg-orange-400 text-white", bar: "bg-orange-400", ring: "ring-orange-200" },
};
const DEFAULT_STYLE = {
  badge: "bg-gray-100 text-gray-500",
  bar: "bg-primary",
  ring: "ring-gray-100",
};

// Bitta reyting qatori.
//  it: { rank, isTied, student, point, averageGrade, attendanceRate }
//  maxPoint: progress bar nisbati uchun (ro'yxatdagi eng katta ball)
//  isMe: o'quvchining o'z qatori
const LeaderboardRow = ({ it, maxPoint = 100, isMe = false }) => {
  const style = RANK_STYLE[it.rank] || DEFAULT_STYLE;
  const pct = maxPoint > 0 ? Math.min(100, (it.point / maxPoint) * 100) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 transition-colors",
        it.rank <= 3 ? cn("ring-1", style.ring) : "border-gray-100",
        isMe && "ring-2 ring-primary/40 border-primary/30",
      )}
    >
      {/* O'rin */}
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold tabular-nums",
          style.badge,
        )}
      >
        {it.rank === 1 ? <Crown className="size-4" /> : it.rank}
      </span>

      {/* Ism + progress + metrikalar */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-gray-900">
            {it.student.firstName} {it.student.lastName}
            {it.isTied && (
              <span className="ml-1.5 align-middle text-[11px] font-normal text-muted-foreground">
                (teng)
              </span>
            )}
            {isMe && (
              <span className="ml-1.5 align-middle text-xs font-normal text-primary">
                (siz)
              </span>
            )}
          </p>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">
            {it.point}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
              ball
            </span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn("h-full rounded-full transition-all", style.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Metrikalar */}
        <p className="mt-1 text-xs text-muted-foreground">
          Baho:{" "}
          <span className="font-medium text-gray-600">
            {it.averageGrade ?? "-"}
          </span>{" "}
          · Davomat:{" "}
          <span className="font-medium text-gray-600">
            {it.attendanceRate != null ? `${it.attendanceRate}%` : "-"}
          </span>
        </p>
      </div>
    </div>
  );
};

export default LeaderboardRow;
