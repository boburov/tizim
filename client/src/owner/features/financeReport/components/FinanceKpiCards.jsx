import {
  ArrowUpRight,
  TrendingUp,
  Wallet,
  ArrowDownLeft,
  Receipt,
  Percent,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import AnimatedCounter from "@/shared/components/ui/counter/AnimatedCounter";

// Bitta KPI karta. hero -> primary fon (reference dizayndagi asosiy karta).
const KpiTile = ({
  icon: Icon,
  label,
  value,
  suffix = "",
  isMoney = false,
  hint,
  delta,
  tone = "default",
  hero = false,
  to,
}) => {
  const hasValue = value !== null && value !== undefined;
  // Xarajat kartasida o'sish ijobiy emas - shuning uchun har doim rose/emerald juftligini
  // statik sinflar bilan beramiz (Tailwind dinamik sinflarni generatsiya qilmaydi).
  const positiveDeltaClass =
    tone === "expense"
      ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300"
      : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";

  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-5 transition",
        hero
          ? "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
      )}
    >
      {hero && (
        <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/10 blur-2xl" />
      )}
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-sm font-medium",
            hero ? "text-primary-foreground/90" : "text-muted-foreground",
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition",
            hero
              ? "bg-white/15 text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          {to ? <ArrowUpRight className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>

      <p
        className={cn(
          "mt-6 font-semibold tracking-tight tabular-nums",
          isMoney ? "text-2xl" : "text-3xl",
          hero ? "text-white" : "text-foreground",
        )}
      >
        {hasValue ? (
          <AnimatedCounter
            value={Number(value) || 0}
            formatter={isMoney ? formatMoney : undefined}
            suffix={suffix}
          />
        ) : (
          <span className={hero ? "text-white/70" : "text-muted-foreground"}>—</span>
        )}
      </p>

      <div
        className={cn(
          "mt-2 flex items-center gap-1.5 text-xs",
          hero ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {delta != null && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              hero
                ? "bg-white/15 text-white"
                : delta >= 0
                  ? positiveDeltaClass
                  : "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-300",
            )}
          >
            <TrendingUp className={cn("size-3", delta < 0 && "rotate-180")} />
            {delta > 0 ? "+" : ""}
            {delta}%
          </span>
        )}
        <span>{hint}</span>
      </div>
    </div>
  );

  return body;
};

const FinanceKpiCards = ({ data }) => {
  if (!data) return null;
  const { income, expense, netProfit, netProfitDelta } = data;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        hero
        icon={Wallet}
        label="Sof foyda"
        value={netProfit}
        isMoney
        delta={netProfitDelta}
        hint="Daromad − xarajat"
      />
      <KpiTile
        icon={ArrowDownLeft}
        label="Daromad (kirim)"
        value={income?.collected}
        isMoney
        delta={income?.delta}
        hint="Bu oy yig'ilgan"
      />
      <KpiTile
        icon={Receipt}
        label="Xarajat (chiqim)"
        value={expense?.paid}
        isMoney
        delta={expense?.delta}
        tone="expense"
        hint="Bu oy to'langan"
      />
      <KpiTile
        icon={Percent}
        label="Yig'ilish darajasi"
        value={income?.rate}
        suffix="%"
        hint="To'lovlar yig'ilishi"
      />
    </div>
  );
};

export default FinanceKpiCards;
