import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, CornerDownRight } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { deltaTone, formatDelta } from "../../utils/metric.utils";

// ASOSIY KO'RSATKICHLAR - eng ko'pi bilan OLTITA.
//
// NEGA OLTITA (va nega ilgari o'n oltita edi): eski sahifada to'rtta
// bo'limda to'rttadan katakcha turardi. O'n oltita raqam - bu nol
// raqam: owner qaysi biri muhimligini ajrata olmagach, hech biriga
// qaramaydi. Oltita esa bitta qarashga sig'adi va har biri boshqa
// savolga tegishli: pul kirdimi, pul osilib qoldimi, o'quvchi
// keldimi, davomat qanday, keyingi oy qanday, voronka ishlayaptimi.
//
// HAR BIR KARTA UCH QATLAMLI:
//   1. RAQAM   - kattaligi bilan darhol ko'zga tashlanadi
//   2. NEGA    - raqam nega shunday (kartadagi sondan kelib chiqmaydi)
//   3. KEYIN   - bu raqam nimaga olib keladi
//
// 2 va 3 ATAYLAB doim ko'rinadi. "Hover'da ko'rsatamiz" degan yechim
// telefonda umuman ishlamaydi, "bosilganda ochiladi" esa oltita karta
// uchun oltita bosish demakdir - ikkalasi ham kontekstni yo'qotadi.

const formatValue = (value, unit) => {
  if (value == null) return "—";
  if (unit === "so'm") return formatMoneyShort(value);
  if (typeof value === "number") {
    return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(value);
  }
  return String(value);
};

const KpiCard = ({ kpi }) => {
  const tone = deltaTone(kpi.key, kpi.delta);
  const deltaText = formatDelta(kpi.delta);
  const DeltaIcon = kpi.delta > 0 ? ArrowUpRight : ArrowDownRight;

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {kpi.label}
      </p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl font-semibold tabular-nums leading-none text-foreground">
          {formatValue(kpi.value, kpi.unit)}
        </span>
        {/* "so'm" ni formatMoneyShort() O'ZI qo'shadi - takrorlash
            "so'm so'm" berardi. Qiymat yo'q bo'lsa ("—") birlik ham
            ko'rsatilmaydi: "— %" hech narsani anglatmaydi. */}
        {kpi.unit && kpi.unit !== "so'm" && kpi.value != null && (
          <span className="text-sm text-muted-foreground">{kpi.unit}</span>
        )}
        {deltaText && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs tabular-nums", tone)}>
            <DeltaIcon className="size-3" />
            {deltaText}
          </span>
        )}
      </div>

      {kpi.hint && (
        <p className="mt-1 truncate text-xs text-muted-foreground">{kpi.hint}</p>
      )}

      <div className="mt-3.5 space-y-1 border-t border-border pt-3">
        {kpi.why && (
          <p className="text-xs leading-relaxed text-muted-foreground">{kpi.why}</p>
        )}
        {kpi.next && (
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground">
            <CornerDownRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
            <span>{kpi.next}</span>
          </p>
        )}
      </div>
    </>
  );

  const classes =
    "flex h-full flex-col rounded-xl border bg-card p-4 transition-colors";

  if (!kpi.href) return <div className={classes}>{body}</div>;

  return (
    <Link to={kpi.href} className={cn(classes, "hover:border-primary/40 hover:bg-accent/40")}>
      {body}
    </Link>
  );
};

const AiKpiGrid = ({ kpis = [] }) => {
  if (!kpis.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {kpis.slice(0, 6).map((kpi) => (
        <KpiCard key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
};

export default AiKpiGrid;
