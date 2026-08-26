import { ShieldAlert, AlertTriangle, CheckCircle2, ArrowRight, Info, Sparkles } from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { MetricValue, LoadingBlock, ErrorBlock } from "@/shared/components/analytics";

/**
 * MOLIYAVIY HARAKAT MARKAZI — uch bo'lim (talab I).
 *
 *   SHOSHILINCH  — bugun qarash kerak
 *   KUZATUV      — yomonlashayotgan, lekin hali kritik emas
 *   IJOBIY       — nima ishlayapti (bu ham kerak: faqat muammo
 *                  ko'rsatadigan panel o'qilmay qoladi)
 *
 * ── MATN SERVERDAN ──
 * Sarlavha va raqamlar deterministik qoidalardan keladi. Bu yerda
 * hech narsa hisoblanmaydi va hech qanday matn "generatsiya"
 * qilinmaydi — AI izohi faqat signal panelida, so'ralganda.
 */

const SECTIONS = [
  { key: "urgent", label: "Shoshilinch", icon: ShieldAlert, tone: "text-destructive", ring: "border-destructive/30 bg-destructive/5", dot: "bg-destructive" },
  { key: "watch", label: "Kuzatuv", icon: AlertTriangle, tone: "text-warning", ring: "border-warning/30 bg-warning/5", dot: "bg-warning" },
  { key: "positive", label: "Ijobiy", icon: CheckCircle2, tone: "text-success", ring: "border-success/30 bg-success/5", dot: "bg-success" },
];

const fmt = (v, metric) => {
  if (v === null || v === undefined) return "—";
  // Foizli ko'rsatkichlar summa emas — "so'm" bilan ko'rsatish xato.
  const isPercent = /rate|margin|utilization|concentration|variance_percent/i.test(metric || "")
    || (Math.abs(v) <= 1000 && /percent|rate|margin|utilization/i.test(metric || ""));
  return isPercent ? `${v}%` : formatMoneyShort(v);
};

const SignalRow = ({ signal, onOpen, onAction }) => {
  const sec = SECTIONS.find((s) => s.key === signal.severity) || SECTIONS[1];
  return (
    <button
      type="button"
      onClick={() => onOpen(signal.id)}
      className={cn(
        "group flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition hover:shadow-sm",
        sec.ring,
      )}
    >
      <span className={cn("mt-1 size-1.5 shrink-0 rounded-full", sec.dot)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{signal.title}</p>

        {/* Eng muhim ikki dalil — qatorning o'zida */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {(signal.evidence || []).slice(0, 2).map((e, i) => (
            <span key={i}>
              {e.label}:{" "}
              <b className="tabular-nums text-foreground">
                {e.unit === "%" ? `${e.current}%` : e.unit && e.unit !== "so'm"
                  ? `${e.current} ${e.unit}` : formatMoneyShort(e.current)}
              </b>
              {e.changePercent !== null && e.changePercent !== undefined && (
                <span className="ml-1">({e.changePercent > 0 ? "+" : ""}{e.changePercent}%)</span>
              )}
            </span>
          ))}
          {signal.confidence?.level === "limited" && (
            <span className="inline-flex items-center gap-0.5 text-warning" title={signal.confidence.reasons?.join("; ")}>
              <Info className="size-3" />
              cheklangan ishonch
            </span>
          )}
        </div>
      </div>

      {signal.recommendedAction?.label && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); onAction?.(signal.recommendedAction.target, signal); }}
          className="mt-0.5 hidden shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted sm:inline-flex"
        >
          {signal.recommendedAction.label}
          <ArrowRight className="size-3" />
        </span>
      )}
    </button>
  );
};

/**
 * `showHint` — sarlavha ostidagi tushuntirish satri.
 * Superadmin paneli uni O'CHIRADI (vizual minimalizm talabi), owner
 * moliya ekranida esa qoladi — u yerda taqqoslash davri boshqa
 * joyda yozilmaydi.
 */
const IntelligenceCenter = ({ query, onOpenSignal, onAction, showHint = true }) => {
  if (query.isLoading) return <LoadingBlock rows={2} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;

  const d = query.data;
  if (!d) return null;
  const total = d.counts.urgent + d.counts.watch + d.counts.positive;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-semibold text-foreground">
            <Sparkles className="size-4 text-muted-foreground" />
            Nimaga e'tibor kerak
          </h2>
          {showHint && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Qoidalar tahlil ustida ishlaydi · taqqoslash: {d.comparison?.label}
            </p>
          )}
        </div>
        {d.dataQuality?.level === "limited" && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning"
            title={d.dataQuality.reasons?.join("\n")}
          >
            <Info className="size-3" />
            Ma'lumot sifati cheklangan
          </span>
        )}
      </header>

      {total === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-foreground">Diqqat talab qiladigan holat topilmadi</span>
        </div>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map((sec) => {
            const items = d.sections?.[sec.key] || [];
            if (!items.length) return null;
            const Icon = sec.icon;
            return (
              <div key={sec.key}>
                <p className={cn("mb-1.5 flex items-center gap-1.5 text-xs font-medium", sec.tone)}>
                  <Icon className="size-3.5" />
                  {sec.label}
                  <span className="text-muted-foreground">({items.length})</span>
                </p>
                <div className="space-y-2">
                  {items.slice(0, 5).map((s) => (
                    <SignalRow key={s.id} signal={s} onOpen={onOpenSignal} onAction={onAction} />
                  ))}
                  {items.length > 5 && (
                    <p className="text-center text-[11px] text-muted-foreground">
                      yana {items.length - 5} ta
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default IntelligenceCenter;
