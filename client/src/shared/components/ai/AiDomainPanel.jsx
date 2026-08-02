import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Lightbulb, Sparkles } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoney } from "@/shared/utils/formatMoney";
import AiRiskBadge from "./AiRiskBadge";

// MODUL AI PANELI - "har bir modulda AI Insights bo'limi bo'lsin" talabi.
//
// Bu panel ATAYLAB KICHIK. Modul sahifasi (o'quvchilar ro'yxati, moliya)
// insight ro'yxati EMAS - u o'z ishini qiladi, panel esa uning ustidagi
// qisqa maslahat. To'liq karta (sabablar, manba havolalari, tugmalar)
// Action Center'da qoladi.
//
// NEGA shunday: agar bu panel to'liq AiInsightCard'larni ko'rsatsa, u
// modul sahifasini bosib ketardi va owner asosiy ishini qilish uchun
// pastga aylantirishi kerak bo'lardi. Bir hafta ichida panel "yopiladigan
// shovqin" ga aylanardi.
//
// BO'SH HOLATDA HECH NARSA KO'RSATILMAYDI (`null` qaytadi): "AI hech
// narsa topmadi" karta har bir sahifada doimiy bo'sh quti bo'lib turardi.

const Row = ({ insight, isOpportunity }) => (
  <li className="flex items-start justify-between gap-3 py-2">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">
        {insight.title || insight.subjectLabel}
      </p>
      {insight.expectedImpact?.label && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {insight.expectedImpact.label}
        </p>
      )}
    </div>
    {/* Imkoniyatda YORLIQ KO'RSATILMAYDI: "low" severity yashil rang
        beradi (to'g'ri), lekin "Past" so'zi o'sish taklifi uchun
        noto'g'ri o'qiladi — owner uni "ahamiyatsiz" deb tushunadi. */}
    <AiRiskBadge
      score={insight.score}
      confidence={insight.confidence}
      severity={isOpportunity ? "low" : insight.severity}
      showLabel={!isOpportunity}
    />
  </li>
);

const Group = ({ title, icon: Icon, iconTone, items, isOpportunity }) => {
  if (!items?.length) return null;
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className={cn("size-3.5", iconTone)} />
        {title}
      </h4>
      <ul className="mt-1 divide-y divide-border">
        {items.map((i) => (
          <Row key={i._id} insight={i} isOpportunity={isOpportunity} />
        ))}
      </ul>
    </div>
  );
};

/**
 * @param {object}  data       - /ai/insights/domain/:domain javobi
 * @param {boolean} isLoading
 * @param {string}  title      - panel sarlavhasi (mas. "Moliya bo'yicha AI tahlili")
 */
const AiDomainPanel = ({ data, isLoading, title = "AI tahlili", className = "" }) => {
  if (isLoading) {
    return <div className={cn("h-40 animate-pulse rounded-xl bg-muted/40", className)} />;
  }

  const risks = data?.risks || [];
  const opportunities = data?.opportunities || [];
  if (!risks.length && !opportunities.length) return null;

  const summary = data?.summary;

  return (
    <section className={cn("rounded-xl border bg-card p-4 xs:p-5", className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-foreground">
          <Sparkles className="size-4 text-primary" />
          {title}
        </h3>
        <Link
          to="/owner/ai"
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Hammasi
          <ChevronRight className="size-3.5" />
        </Link>
      </header>

      {summary?.impactAtRisk > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {/* `so'm` ni formatMoney() O'ZI qo'shadi - takrorlash "so'm so'm" berardi. */}
          {formatMoney(summary.impactAtRisk)} xavf ostida
          {summary.upside > 0 && ` · ~${formatMoney(summary.upside)} imkoniyat`}
        </p>
      )}

      <div className="mt-3 space-y-4">
        <Group
          title="E'tibor talab qiladi"
          icon={AlertTriangle}
          iconTone="text-rose-600 dark:text-rose-400"
          items={risks}
        />
        <Group
          title="Imkoniyatlar"
          icon={Lightbulb}
          iconTone="text-emerald-600 dark:text-emerald-400"
          items={opportunities}
          isOpportunity
        />
      </div>
    </section>
  );
};

export default AiDomainPanel;
