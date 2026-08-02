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
          : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
      )}
    >
      {hero && (
        <div className="pointer-events-none absolute -right-8 -top-10 size-36 rounded-full bg-primary-foreground/10 blur-2xl" />
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
              ? "bg-primary-foreground/15 text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          {to ? <ArrowUpRight className="size-4" /> : <Icon className="size-4" />}
        </span>
      </div>

      <p
        className={cn(
          "mt-6 font-semibold tracking-tight tabular-nums",
          isMoney ? "text-2xl" : "text-4xl",
          hero ? "text-primary-foreground" : "text-foreground",
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
          hero ? "text-primary-foreground/80" : "text-muted-foreground",
        )}
      >
        {delta != null && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
              hero
                ? "bg-primary-foreground/15 text-primary-foreground"
                : delta >= 0
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive",
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
        to="/owner/students"
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
        to="/owner/students"
      />
      <StatTile
        icon={Wallet}
        label="Bu oy daromad"
        value={data.revenueThisMonth}
        isMoney
        delta={data.revenueDelta}
        hint="O'tgan oyga nisbatan"
        to="/owner/students/tolovlar"
      />
    </div>
  );
};

export default DashboardStatCards;
