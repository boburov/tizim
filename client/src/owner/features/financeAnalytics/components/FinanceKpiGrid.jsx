import {
  Wallet, TrendingUp, Receipt, Coins, Landmark, HandCoins, Percent, Scale,
} from "lucide-react";

import { cn } from "@/shared/utils/cn";
import { MetricValue, ComparisonBadge, LoadingBlock, ErrorBlock } from "@/shared/components/analytics";
import { isMissing } from "@/shared/components/analytics";

/**
 * ASOSIY KO'RSATKICHLAR.
 *
 * ═══════════════════════════════════════════════════════════════════
 * "FOYDA" VA "PUL" ATAYLAB YONMA-YON TURADI
 *
 * Ular BOSHQA narsa va aynan shu tushunmovchilik eng qimmatga tushadi:
 * qarzga o'qiyotgan o'quvchi foyda beradi, pul bermaydi; egasining
 * investitsiyasi pul beradi, foyda bermaydi.
 *
 * Shuning uchun "Kassa qoldig'i" kartasi ostida ochiq izoh turadi va
 * u hech qachon "foyda" deb atalmaydi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * `invert` — o'sishi YOMON bo'lgan ko'rsatkichlar (xarajat, qarzdorlik).
 * Ularda yashil "+" ko'rsatish xato signal bo'lardi.
 */

const KpiCard = ({
  icon: Icon, label, value, kind = "moneyShort", compare, invert,
  hint, hero, suffix, onClick, emptyTitle,
}) => {
  const clickable = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        "group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition",
        hero
          ? "border-transparent bg-primary text-primary-foreground shadow-lg shadow-primary/20"
          : "border-border bg-card",
        clickable && !hero && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        clickable && "cursor-pointer",
        !clickable && "cursor-default",
      )}
    >
      {hero && (
        <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-primary-foreground/10 blur-2xl" />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-xs font-medium", hero ? "text-primary-foreground/90" : "text-muted-foreground")}>
          {label}
        </p>
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full transition",
            hero
              ? "bg-primary-foreground/15 text-primary-foreground"
              : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </div>

      <p
        className={cn(
          "mt-4 text-xl font-semibold tracking-tight",
          hero ? "text-primary-foreground" : "text-foreground",
        )}
      >
        <MetricValue value={value} kind={kind} emptyTitle={emptyTitle} />
        {!isMissing(value) && suffix}
      </p>

      <div className={cn("mt-2 flex flex-wrap items-center gap-1.5 text-[11px]",
        hero ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {compare && !hero && <ComparisonBadge compare={compare} invert={invert} />}
        {hint && <span>{hint}</span>}
      </div>
    </button>
  );
};

const FinanceKpiGrid = ({ query, onDrill }) => {
  if (query.isLoading) return <LoadingBlock rows={2} />;
  if (query.isError) return <ErrorBlock error={query.error} onRetry={query.refetch} />;

  const d = query.data;
  if (!d) return null;

  const go = (key) => (onDrill ? () => onDrill(key) : undefined);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        hero icon={Scale} label="Hissa foydasi"
        value={d.contributionProfit?.current} compare={d.contributionProfit}
        hint="Daromad − to'g'ridan-to'g'ri xarajat"
        onClick={go("profitability")}
      />
      <KpiCard
        icon={TrendingUp} label="Daromad" value={d.revenue?.current}
        compare={d.revenue} hint="Qaytarimlar ayirilgan" onClick={go("revenue")}
      />
      <KpiCard
        icon={Receipt} label="Xarajat" value={d.operatingExpenses?.current}
        compare={d.operatingExpenses} invert hint="Maosh + komissiya bilan"
        onClick={go("expenses")}
      />
      <KpiCard
        icon={Percent} label="Hissa marjasi" value={d.contributionMargin?.current}
        kind="percent" hint="Daromadning necha foizi qoladi"
        emptyTitle="Daromad nol — marja hisoblanmaydi"
        onClick={go("profitability")}
      />

      <KpiCard
        icon={Coins} label="Operatsion natija" value={d.operatingResult?.current}
        compare={d.operatingResult} hint="Barcha operatsion xarajatdan keyin"
      />
      <KpiCard
        icon={Wallet} label="Kassa qoldig'i" value={d.cashBalance}
        // ⚠ FOYDA EMAS. Izoh ATAYLAB har doim ko'rinadi.
        hint="Foyda emas — hozir mavjud pul"
        emptyTitle="Kassa harakati yo'q"
        onClick={go("cash")}
      />
      <KpiCard
        icon={HandCoins} label="Qarzdorlik" value={d.receivables?.outstanding?.current}
        compare={d.receivables?.outstanding} invert hint="Undirilmagan qoldiq"
        onClick={go("receivables")}
      />
      <KpiCard
        icon={Landmark} label="Undirish darajasi"
        value={d.receivables?.collectionRate?.current} kind="percent"
        hint="Undirilgan / kutilgan"
        emptyTitle="Bu davrda kutilgan to'lov yo'q"
        onClick={go("receivables")}
      />
    </div>
  );
};

export default FinanceKpiGrid;
