import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarClock,
  Coins,
  Wallet,
  AlertTriangle,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Bitta breakdown kartasi. to berilsa - butun karta bosiladigan havola bo'ladi.
const Card = ({ icon: Icon, label, value, hint, tone = "default", to }) => {
  const toneClasses =
    tone === "debt"
      ? "text-rose-600"
      : tone === "loss"
        ? "text-amber-700"
        : "text-zinc-900";

  const inner = (
    <div
      className={cn(
        "group flex h-full flex-col justify-between rounded-2xl border p-5 transition",
        tone === "loss"
          ? "border-amber-200 bg-amber-50"
          : "border-zinc-200/80 bg-white",
        to && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-600">{label}</p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition",
            tone === "loss"
              ? "bg-amber-100 text-amber-600"
              : "bg-zinc-100 text-zinc-500 group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          {to ? <ArrowUpRight className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>
      <p className={cn("mt-6 text-2xl font-semibold tracking-tight tabular-nums", toneClasses)}>
        {formatMoney(value || 0)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );

  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
};

// Oylik to'lov tafsiloti: kelishi kerak / kelgan / qarz / undirilishi kerak (zarar).
const IncomeBreakdownCards = ({ income }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Card
      icon={CalendarClock}
      label="Yig'ilishi kerak bo'lgan summa"
      value={income?.billed}
      hint="Bu oy hisoblangan (reja)"
    />
    <Card
      icon={Coins}
      label="Yig'ilgan summa"
      value={income?.collected}
      hint="Bu oy yig'ilgan"
    />
    <Card
      icon={Wallet}
      label="Qarzdorlik"
      value={income?.outstanding}
      hint="Undiriladigan qoldiq"
      tone="debt"
    />
    <Card
      icon={AlertTriangle}
      label="Undirilishi kerak bo'lgan summa"
      value={income?.badDebt}
      hint="Hisobdan chiqarilgan (zarar)"
      tone="loss"
      to="/owner/finance/write-offs"
    />
  </div>
);

export default IncomeBreakdownCards;
