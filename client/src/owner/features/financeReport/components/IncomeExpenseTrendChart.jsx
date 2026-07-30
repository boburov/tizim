import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import useFinanceTrendQuery from "../hooks/useFinanceTrendQuery";
import { shortMoney } from "../utils/format";

// So'nggi 12 oy: kirim (primary) vs chiqim (rose) bar chart - reference markaziy element.
const IncomeExpenseTrendChart = () => {
  const { data, isLoading } = useFinanceTrendQuery({ months: 12 });

  const buckets = data || [];
  const max = Math.max(
    1,
    ...buckets.flatMap((b) => [b.income || 0, b.expense || 0]),
  );
  const totalIncome = buckets.reduce((s, b) => s + (b.income || 0), 0);
  const totalExpense = buckets.reduce((s, b) => s + (b.expense || 0), 0);
  const net = totalIncome - totalExpense;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground">Kirim / chiqim dinamikasi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">So'nggi 12 oy</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">12 oylik sof</p>
          <p
            className={cn(
              "text-lg font-semibold tabular-nums",
              net >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
            )}
          >
            {net > 0 ? "+" : ""}
            {formatMoney(net)}
          </p>
        </div>
      </div>

      {/* Xulosa */}
      <div className="mt-4 flex flex-wrap gap-5">
        <div>
          <p className="text-[11px] text-muted-foreground">Jami kirim</p>
          <p className="text-sm font-semibold text-primary">
            {formatMoney(totalIncome)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Jami chiqim</p>
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-300">
            {formatMoney(totalExpense)}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      {isLoading ? (
        <div className="mt-6 h-56 animate-pulse rounded-xl bg-muted" />
      ) : buckets.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-6 flex h-56 items-end gap-1.5 sm:gap-2.5">
          {buckets.map((b, i) => {
            const incPct = Math.round(((b.income || 0) / max) * 100);
            const expPct = Math.round(((b.expense || 0) / max) * 100);
            const has = (b.income || 0) > 0 || (b.expense || 0) > 0;
            return (
              <div
                key={`${b.year}-${b.month}-${i}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
              >
                {has && (
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-[10px] text-background opacity-0 shadow-lg transition group-hover:opacity-100">
                    <span className="font-medium text-emerald-300">
                      ↑ {shortMoney(b.income)}
                    </span>
                    <br />
                    <span className="font-medium text-rose-300">
                      ↓ {shortMoney(b.expense)}
                    </span>
                  </div>
                )}
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div
                    className="w-1/2 max-w-3 rounded-t-md bg-primary transition-all duration-500"
                    style={{ height: `${Math.max(incPct, b.income > 0 ? 3 : 0)}%` }}
                  />
                  <div
                    className="w-1/2 max-w-3 rounded-t-md bg-rose-500 transition-all duration-500"
                    style={{ height: `${Math.max(expPct, b.expense > 0 ? 3 : 0)}%` }}
                  />
                </div>
                <span className="mt-1.5 truncate text-[10px] text-muted-foreground">
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" /> Kirim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-500" /> Chiqim
        </span>
      </div>
    </div>
  );
};

export default IncomeExpenseTrendChart;
