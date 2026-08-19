import { PieChart, Repeat } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import MetricValue from "../MetricValue";
import ComparisonBadge from "../ComparisonBadge";
import TrendChart from "../TrendChart";
import AnalyticsTable from "../AnalyticsTable";
import { QueryState } from "../StateBlock";
import {
  useExpenseTrend, useExpenseBreakdown, useCostStructure, useRecurringSplit,
} from "../../hooks/useFinanceAnalytics";

/**
 * CHIQIM BO'LIMI.
 *
 * ── "QAYSI XARAJAT O'SAYAPTI" — ASOSIY SAVOL ──
 * Shuning uchun kategoriya jadvali standart holda O'SISH bo'yicha
 * emas, SUMMA bo'yicha saralanadi (eng katta xarajat birinchi), lekin
 * o'sish ustuni yonida turadi va bir bosishda saralanadi. Eng tez
 * o'sayotganlar esa alohida ro'yxatda — ular ogohlantirish manbai.
 */
const CostBar = ({ label, value, total, tone }) => {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          <MetricValue value={value} kind="moneyShort" /> · {pct}%
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const ExpenseSection = ({ filters, onDrill }) => {
  const trend = useExpenseTrend(filters);
  const breakdown = useExpenseBreakdown(filters);
  const structure = useCostStructure(filters);
  const recurring = useRecurringSplit(filters);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Chiqim dinamikasi</h2>
        <TrendChart
          query={trend}
          series={[
            { key: "payroll", label: "Maosh", color: "hsl(var(--primary))" },
            { key: "other", label: "Boshqa chiqim", color: "hsl(var(--warning))" },
          ]}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <PieChart className="size-4 text-muted-foreground" />
            Xarajat tuzilmasi
          </h2>
          {structure.data && (
            <div className="space-y-3">
              <CostBar label="Doimiy" value={structure.data.fixed} total={structure.data.total} tone="bg-primary" />
              <CostBar label="O'zgaruvchan" value={structure.data.variable} total={structure.data.total} tone="bg-warning" />
              {structure.data.unclassified > 0 && (
                <CostBar
                  label="Tasniflanmagan" value={structure.data.unclassified}
                  total={structure.data.total} tone="bg-muted-foreground"
                />
              )}
              {/* Serverning izohi — o'ylab topilgan matn emas. */}
              {structure.data.note && (
                <p className="rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                  {structure.data.note}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <Repeat className="size-4 text-muted-foreground" />
            Takrorlanuvchi
          </h2>
          {recurring.data && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Takrorlanuvchi</span>
                <span className="font-medium">
                  <MetricValue value={recurring.data.recurring?.amount} kind="moneyShort" />
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({recurring.data.recurring?.count} ta)
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bir martalik</span>
                <span className="font-medium">
                  <MetricValue value={recurring.data.oneTime?.amount} kind="moneyShort" />
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({recurring.data.oneTime?.count} ta)
                  </span>
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 lg:col-span-1">
          <h2 className="mb-3 font-semibold text-foreground">Eng tez o'sayotgan</h2>
          {breakdown.data?.topGrowing?.length ? (
            <ul className="space-y-2">
              {breakdown.data.topGrowing.slice(0, 5).map((c) => (
                <li key={c.categoryId || c.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-foreground">{c.name}</span>
                  <ComparisonBadge compare={c} invert />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">O'sish qayd etilmadi</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold text-foreground">Kategoriyalar</h2>
        <QueryState
          query={breakdown}
          empty={!breakdown.data?.items?.length}
          emptyTitle="Bu davrda chiqim yo'q"
        >
          {(data) => (
            <AnalyticsTable
              rows={data.items}
              rowKey={(r) => r.categoryId || r.name}
              defaultSort={{ key: "current", dir: "desc" }}
              onRowClick={(r) => onDrill?.({ type: "expenseCategory", id: r.categoryId, name: r.name })}
              columns={[
                { key: "name", label: "Kategoriya" },
                { key: "current", label: "Joriy", align: "right", kind: "moneyShort" },
                { key: "previous", label: "Oldingi", align: "right", kind: "moneyShort" },
                {
                  key: "changePercent", label: "O'zgarish", align: "right",
                  render: (r) => <ComparisonBadge compare={r} invert />,
                },
                { key: "sharePercent", label: "Ulush", align: "right", kind: "percent" },
                { key: "count", label: "Soni", align: "right", kind: "number" },
              ]}
            />
          )}
        </QueryState>
      </section>
    </div>
  );
};

export default ExpenseSection;
