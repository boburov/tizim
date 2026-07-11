import EmptyState from "@/shared/components/ui/feedback/EmptyState";
import Skeleton from "@/shared/components/ui/feedback/Skeleton";
import { Tags } from "lucide-react";

/**
 * TypeBars - "Tur bo'yicha" taqsimot.
 * Har bir tur yonida horizontal progress bar; eng kattasi 100% to'ladi.
 * data: [{ typeId, name, count }]
 */
const TypeBars = ({ data = [], isLoading = false }) => {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={Tags}
        compact
        title="Ma'lumot yo'q"
        description="Tanlangan davrda hech qanday feedback turi yo'q."
      />
    );
  }

  const max = Math.max(...data.map((t) => t.count), 1);

  return (
    <ul className="space-y-3">
      {data.map((t) => {
        const pct = Math.round((t.count / max) * 100);
        return (
          <li key={String(t.typeId)} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate">{t.name || "Noma'lum tur"}</span>
              <span className="shrink-0 font-medium tabular-nums">
                {t.count}
              </span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={t.count}
              aria-valuemin={0}
              aria-valuemax={max}
            >
              <div
                className="h-full rounded-full bg-primary/60 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export default TypeBars;
