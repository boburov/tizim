// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowUpRight, TrendingUp, GraduationCap, Layers, UserPlus, Wallet } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";

// Components
import AnimatedCounter from "@/shared/components/ui/counter/AnimatedCounter";

// Bitta karta - reference dizayndagi 4 ta yuqori ko'rsatkich. Birinchisi (hero) primary fon.
const StatTile = ({ icon: Icon, label, value, suffix, isMoney, hint, delta, to, hero }) => {
  const body = (
    <div
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-5 transition",
        hero
          ? "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "border-zinc-200/80 bg-white hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
      )}
    >
      {hero && (
        <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-white/10 blur-2xl" />
      )}
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-sm font-medium",
            hero ? "text-primary-foreground/90" : "text-zinc-600",
          )}
        >
          {label}
        </p>
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-full transition",
            hero
              ? "bg-white/15 text-primary-foreground"
              : "bg-zinc-100 text-zinc-500 group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          {to ? <ArrowUpRight className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>

      <p
        className={cn(
          "mt-6 font-semibold tracking-tight tabular-nums",
          isMoney ? "text-2xl" : "text-4xl",
          hero ? "text-white" : "text-zinc-900",
        )}
      >
        <AnimatedCounter
          value={Number(value) || 0}
          formatter={isMoney ? formatMoney : undefined}
          suffix={suffix || ""}
        />
      </p>

      <div
        className={cn(
          "mt-2 flex items-center gap-1.5 text-xs",
          hero ? "text-primary-foreground/80" : "text-zinc-500",
        )}
      >
        {delta != null && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              hero
                ? "bg-white/15 text-white"
                : delta >= 0
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600",
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

  if (to) return <Link to={to} className="block focus:outline-none">{body}</Link>;
  return body;
};

const DashboardStatCards = ({ data }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        hero
        icon={GraduationCap}
        label="Jami o'quvchilar"
        value={data.studentsCount}
        delta={null}
        hint="Faol o'quvchilar"
        to="/owner/users"
      />
      <StatTile
        icon={Layers}
        label="Faol guruhlar"
        value={data.activeGroupsCount}
        hint={`${data.teachersCount} o'qituvchi`}
        to="/owner/groups"
      />
      <StatTile
        icon={UserPlus}
        label="Bu oy yangi"
        value={data.newStudentsThisMonth}
        delta={data.netGrowth}
        hint="Yangi qo'shilganlar"
        to="/owner/users"
      />
      <StatTile
        icon={Wallet}
        label="Bu oy daromad"
        value={data.revenueThisMonth}
        isMoney
        delta={data.revenueDelta}
        hint="O'tgan oyga nisbatan"
        to="/owner/finance/student-payments"
      />
    </div>
  );
};

export default DashboardStatCards;
