import { CalendarDays, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { MetricValue, ComparisonBadge, LoadingBlock } from "@/shared/components/analytics";

/**
 * KUNLIK MOLIYAVIY BRIFING (talab J).
 *
 * ── AYNI INTELLEKT OBYEKTLARIDAN QURILADI ──
 * Brifing moliyaviy jadvallarga ALOHIDA so'rov yubormaydi: server
 * uni o'sha signallardan yig'adi. Aks holda brifingdagi raqam
 * pastdagi kartalardagidan farq qilib qolardi — va foydalanuvchi
 * qaysi biriga ishonishni bilmasdi.
 */
const BriefingCard = ({ query, onOpenSignal }) => {
  if (query.isLoading) return <LoadingBlock rows={1} />;
  if (query.isError) return null;
  const d = query.data;
  if (!d) return null;

  const dateLabel = new Date(d.period.to) > new Date()
    ? new Date().toLocaleDateString("uz-UZ", { day: "numeric", month: "long" })
    : new Date(d.period.to).toLocaleDateString("uz-UZ", { day: "numeric", month: "long" });

  const rows = [
    { label: "Daromad", data: d.headline?.revenue },
    { label: "Xarajat", data: d.headline?.operatingExpenses, invert: true },
    { label: "Hissa foydasi", data: d.headline?.contributionProfit },
  ];

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <CalendarDays className="size-4 text-muted-foreground" />
        <h2 className="font-semibold text-foreground">{dateLabel} — moliyaviy xulosa</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Taqqoslash: {d.comparison?.label}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-xl border border-border p-3">
            <p className="text-xs text-muted-foreground">{r.label}</p>
            <p className="mt-1 font-semibold text-foreground">
              <MetricValue value={r.data?.current} kind="moneyShort" />
            </p>
            <ComparisonBadge compare={r.data} invert={r.invert} className="mt-1" />
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {d.mainConcern && (
          <button
            type="button"
            onClick={() => onOpenSignal?.(d.mainConcern.id)}
            className="flex w-full items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-left transition hover:shadow-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">Asosiy tashvish</span>
              <span className="block text-sm text-foreground">{d.mainConcern.title}</span>
            </span>
          </button>
        )}
        {d.positive && (
          <button
            type="button"
            onClick={() => onOpenSignal?.(d.positive.id)}
            className="flex w-full items-start gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-left transition hover:shadow-sm"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted-foreground">Ijobiy</span>
              <span className="block text-sm text-foreground">{d.positive.title}</span>
            </span>
          </button>
        )}
      </div>

      {d.dataQuality?.level === "limited" && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Ma'lumot sifati cheklangan: {d.dataQuality.reasons?.[0]}
        </p>
      )}
    </section>
  );
};

export default BriefingCard;
