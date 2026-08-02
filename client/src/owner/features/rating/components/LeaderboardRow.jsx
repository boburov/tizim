// Icons
import { Crown } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";

// Top-3 medal uslubi (oltin/kumush/bronza), qolgani neytral.
const RANK_STYLE = {
  1: { badge: "bg-amber-400 text-white", bar: "bg-amber-400", ring: "ring-amber-200" },
  2: { badge: "bg-slate-500 text-white", bar: "bg-slate-500", ring: "ring-border" },
  3: { badge: "bg-orange-400 text-white", bar: "bg-orange-400", ring: "ring-orange-200" },
};
const DEFAULT_STYLE = {
  badge: "bg-muted text-muted-foreground",
  bar: "bg-primary",
  ring: "ring-border",
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
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition-colors",
        it.rank <= 3 ? cn("ring-1", style.ring) : "border-border",
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
          <p className="truncate text-sm font-medium text-foreground">
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
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {it.point}
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
              ball
            </span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", style.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Metrikalar */}
        <p className="mt-1 text-xs text-muted-foreground">
          Baho:{" "}
          <span className="font-medium text-muted-foreground">
            {it.averageGrade ?? "-"}
          </span>{" "}
          · Davomat:{" "}
          <span className="font-medium text-muted-foreground">
            {it.attendanceRate != null ? `${it.attendanceRate}%` : "-"}
          </span>
        </p>
      </div>
    </div>
  );
};

export default LeaderboardRow;
