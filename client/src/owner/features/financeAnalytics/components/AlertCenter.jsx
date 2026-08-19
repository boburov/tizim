import { AlertTriangle, Info, CheckCircle2, ArrowRight, ShieldAlert } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { LoadingBlock, ErrorBlock } from "./StateBlock";

/**
 * MOLIYAVIY HARAKAT MARKAZI.
 *
 * ── MATN SERVERDAN KELADI, BU YERDA YOZILMAYDI ──
 * Har ogohlantirishning `title` va `explanation` maydonlari serverda
 * IKKI HAQIQIY RAQAMDAN yig'iladi (joriy va taqqoslash qiymati).
 * Frontend ularni faqat KO'RSATADI.
 *
 * Bu qoida muhim: bu yerda "aqlli" matn yozilsa, u serverdagi raqam
 * bilan ajralib ketishi mumkin edi va foydalanuvchi ikki xil
 * tushuntirishni ko'rgan bo'lardi. Ogohlantirishga bir marta
 * ishonmay qolgan odam butun bo'limga qaytmaydi.
 *
 * Har kartada `currentValue` va `comparisonValue` OCHIQ ko'rsatiladi —
 * foydalanuvchi xulosani O'ZI tekshira oladi.
 */

const SEVERITY = {
  high: {
    icon: ShieldAlert,
    ring: "border-destructive/30 bg-destructive/5",
    dot: "bg-destructive",
    label: "Muhim",
  },
  medium: {
    icon: AlertTriangle,
    ring: "border-warning/30 bg-warning/5",
    dot: "bg-warning",
    label: "E'tibor",
  },
  low: {
    icon: Info,
    ring: "border-border bg-muted/30",
    dot: "bg-muted-foreground",
    label: "Kuzatuv",
  },
  good: {
    icon: CheckCircle2,
    ring: "border-success/30 bg-success/5",
    dot: "bg-success",
    label: "Ijobiy",
  },
};

// Ogohlantirish turi → qaysi bo'limga olib boradi.
const ACTION_TARGET = {
  expense_growth: { tab: "expenses", label: "Chiqimni ko'rish" },
  budget_overspend: { tab: "budget", label: "Byudjetni ko'rish" },
  collection_drop: { tab: "receivables", label: "Qarzdorlikni ko'rish" },
  collection_low: { tab: "receivables", label: "Qarzdorlikni ko'rish" },
  aged_receivables: { tab: "receivables", label: "Eski qarzlar" },
  profit_drop: { tab: "profitability", label: "Foydalilikni ko'rish" },
  profit_growth: { tab: "profitability", label: "Foydalilikni ko'rish" },
  discount_anomaly: { tab: "revenue", label: "Chegirmalarni ko'rish" },
  refund_spike: { tab: "revenue", label: "Qaytarimlarni ko'rish" },
  room_underutilized: { tab: "profitability", label: "Xonalarni ko'rish" },
  direction_low_margin: { tab: "profitability", label: "Yo'nalishni ko'rish" },
};

const fmt = (v, code) => {
  if (v === null || v === undefined) return "—";
  // Foizli ko'rsatkichlar summa emas — ularni "so'm" bilan ko'rsatish
  // bema'ni bo'lardi.
  const isPercent = ["collection_drop", "collection_low", "room_underutilized",
    "direction_low_margin", "discount_anomaly", "expense_growth", "profit_drop",
    "profit_growth", "budget_overspend"].includes(code)
    && Math.abs(Number(v)) <= 1000;
  return isPercent ? `${v}%` : formatMoneyShort(v);
};

const AlertCard = ({ alert, onAction }) => {
  const s = SEVERITY[alert.severity] || SEVERITY.low;
  const Icon = s.icon;
  const target = ACTION_TARGET[alert.code];

  return (
    <div className={cn("flex gap-3 rounded-xl border p-3", s.ring)}>
      <span className="mt-0.5 shrink-0">
        <Icon className={cn("size-4",
          alert.severity === "high" ? "text-destructive"
            : alert.severity === "good" ? "text-success"
              : alert.severity === "medium" ? "text-warning" : "text-muted-foreground")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{alert.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{alert.explanation}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            Joriy: <b className="text-foreground tabular-nums">{fmt(alert.currentValue, alert.code)}</b>
          </span>
          <span>
            Taqqoslash: <b className="text-foreground tabular-nums">{fmt(alert.comparisonValue, alert.code)}</b>
          </span>
          {target && onAction && (
            <button
              type="button"
              onClick={() => onAction(target.tab, alert)}
              className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              {target.label}
              <ArrowRight className="size-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const AlertCenter = ({ query, onAction, limit = 6 }) => {
  if (query.isLoading) return <LoadingBlock rows={2} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;

  const data = query.data;
  const alerts = data?.alerts || [];

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-foreground">Nimaga e'tibor kerak</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Qoidalar asosida — har raqam serverdan
          </p>
        </div>
        {data?.counts && (
          <div className="flex items-center gap-2 text-[11px]">
            {["high", "medium", "low", "good"].map((k) =>
              data.counts[k] ? (
                <span key={k} className="inline-flex items-center gap-1">
                  <span className={cn("size-1.5 rounded-full", SEVERITY[k].dot)} />
                  {data.counts[k]} {SEVERITY[k].label.toLowerCase()}
                </span>
              ) : null,
            )}
          </div>
        )}
      </header>

      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="size-4 text-success" />
          <span className="text-foreground">Diqqat talab qiladigan holat topilmadi</span>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.slice(0, limit).map((a, i) => (
            <AlertCard key={`${a.code}-${i}`} alert={a} onAction={onAction} />
          ))}
          {alerts.length > limit && (
            <p className="pt-1 text-center text-xs text-muted-foreground">
              yana {alerts.length - limit} ta signal
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default AlertCenter;
