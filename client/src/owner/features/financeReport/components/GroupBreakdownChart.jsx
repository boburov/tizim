import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Guruhlar kesimida kirim/chiqim gorizontal barlar (reference "Major Expenses" uslubi).
const GroupBreakdownChart = ({ items = [], isLoading = false }) => {
  const max = Math.max(
    1,
    ...items.flatMap((it) => [it.income || 0, it.expense || 0]),
  );

  return (
    <div className="flex h-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-zinc-900">Guruhlar kesimi</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Kirim va chiqim bo'yicha</p>
        </div>
        <div className="flex gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" /> Kirim
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-rose-500" /> Chiqim
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-4 flex-1 space-y-4">
          {items.map((it) => {
            const incW = Math.round(((it.income || 0) / max) * 100);
            const expW = Math.round(((it.expense || 0) / max) * 100);
            return (
              <div key={it.groupId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-700">
                    {it.groupName}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-semibold tabular-nums",
                      it.net >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {it.net > 0 ? "+" : ""}
                    {formatMoney(it.net)}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-50">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.max(incW, it.income > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-50">
                    <div
                      className="h-full rounded-full bg-rose-500 transition-all duration-500"
                      style={{ width: `${Math.max(expW, it.expense > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GroupBreakdownChart;
