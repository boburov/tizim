import { useState } from "react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import useCashflowQuery from "../hooks/useCashflowQuery";

const TABS = [
  { value: "week", label: "Hafta" },
  { value: "month", label: "Oy" },
  { value: "year", label: "Yil" },
];

// Katta summalarni qisqartirib ko'rsatish: 2 400 000 -> "2.4 mln"
const shortMoney = (n) => {
  const num = Number(n) || 0;
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(1).replace(/\.0$/, "")} mln`;
  if (num >= 1_000) return `${Math.round(num / 1_000)} ming`;
  return String(num);
};

const CashflowChart = () => {
  // Default: joriy oy
  const [range, setRange] = useState("month");
  const { data, isLoading } = useCashflowQuery({ range });

  const buckets = data?.buckets || [];
  const max = Math.max(
    1,
    ...buckets.flatMap((b) => [b.income || 0, b.expense || 0]),
  );
  const totalIncome = buckets.reduce((s, b) => s + (b.income || 0), 0);
  const totalExpense = buckets.reduce((s, b) => s + (b.expense || 0), 0);
  const net = totalIncome - totalExpense;

  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-semibold text-zinc-900">Moliyaviy oqim</h2>

        {/* Tablar */}
        <div className="flex rounded-lg bg-zinc-100 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setRange(t.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                range === t.value
                  ? "bg-white text-primary shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Xulosa */}
      <div className="mt-4 flex flex-wrap gap-4">
        <div>
          <p className="text-[11px] text-zinc-500">Kirim</p>
          <p className="text-sm font-semibold text-primary">
            {formatMoney(totalIncome)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Chiqim</p>
          <p className="text-sm font-semibold text-rose-600">
            {formatMoney(totalExpense)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500">Sof</p>
          <p
            className={cn(
              "text-sm font-semibold",
              net >= 0 ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {net > 0 ? "+" : ""}
            {formatMoney(net)}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      {isLoading ? (
        <div className="mt-6 h-44 animate-pulse rounded-xl bg-zinc-100" />
      ) : buckets.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-400">Ma'lumot yo'q</p>
      ) : (
        <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2">
          {buckets.map((b, i) => {
            const incPct = Math.round(((b.income || 0) / max) * 100);
            const expPct = Math.round(((b.expense || 0) / max) * 100);
            const has = (b.income || 0) > 0 || (b.expense || 0) > 0;
            return (
              <div
                key={`${b.label}-${i}`}
                className="group relative flex h-full flex-1 flex-col items-center justify-end"
              >
                {/* Tooltip */}
                {has && (
                  <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[10px] text-white opacity-0 shadow transition group-hover:opacity-100">
                    <span className="text-primary-foreground">
                      {shortMoney(b.income)}
                    </span>
                    {" / "}
                    <span className="text-rose-400">
                      {shortMoney(b.expense)}
                    </span>
                  </div>
                )}
                <div className="flex h-full w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 max-w-2.5 rounded-t bg-primary transition-all duration-500"
                    style={{
                      height: `${Math.max(incPct, b.income > 0 ? 4 : 0)}%`,
                    }}
                  />
                  <div
                    className="w-1/2 max-w-2.5 rounded-t bg-rose-600 transition-all duration-500"
                    style={{
                      height: `${Math.max(expPct, b.expense > 0 ? 4 : 0)}%`,
                    }}
                  />
                </div>
                <span className="mt-1.5 truncate text-[10px] text-zinc-500">
                  {b.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-primary" /> Kirim
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-rose-600" /> Chiqim
        </span>
      </div>
    </div>
  );
};

export default CashflowChart;
