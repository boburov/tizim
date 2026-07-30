// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowUpRight } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Components
import Card from "@/shared/components/ui/card/Card";
import AnimatedCounter from "@/shared/components/ui/counter/AnimatedCounter";

const StatCard = ({
  hint,
  label,
  value,
  icon: Icon,
  suffix = "",
  isMoney = false,
  tone = "default",
  to,
  onClick,
}) => {
  const toneClass = {
    default: "bg-card",
    positive: "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30",
    negative: "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30",
    info: "bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30",
    warn: "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30",
  }[tone];

  const iconTone = {
    default: "text-muted-foreground",
    positive: "text-green-500 dark:text-green-400",
    negative: "text-rose-500 dark:text-rose-400",
    info: "text-blue-500 dark:text-blue-400",
    warn: "text-amber-500 dark:text-amber-400",
  }[tone];

  const safeValue =
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  const interactive = !!to || !!onClick;

  const card = (
    <Card
      className={cn(
        toneClass,
        "h-full",
        interactive &&
          "group cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40",
      )}
    >
      {/* Top */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className={cn("size-4", iconTone)} />}
      </div>

      <p
        className={cn(
          "font-semibold tracking-tight tabular-nums",
          // Pul summalari uzun bo'lishi mumkin - kichikroq, moslashuvchan o'lcham.
          // min-h: animatsiya paytida 1->2 qatorga o'tganda karta sakramasligi uchun.
          isMoney
            ? "min-h-[3.25rem] text-xl leading-snug break-words"
            : "text-2xl",
        )}
      >
        {value === null || value === undefined ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <AnimatedCounter
            value={safeValue}
            formatter={isMoney ? formatMoney : undefined}
            suffix={suffix}
          />
        )}
      </p>

      {(hint || interactive) && (
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {hint}
          {interactive && (
            <ArrowUpRight className="size-3 text-muted-foreground transition group-hover:text-primary" />
          )}
        </p>
      )}
    </Card>
  );

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none">
        {card}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left focus:outline-none"
      >
        {card}
      </button>
    );
  }
  return card;
};

export default StatCard;
