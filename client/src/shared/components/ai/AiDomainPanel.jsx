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

// Qator BOSILADI va subyekt profiliga olib boradi (guruh → guruh detali,
// o'quvchi → o'quvchi kartasi, ...). Manzilni server tayyorlaydi
// (`subjectHref`, ai/services/subjectLink.service.js) - shu payt panel uni
// e'tiborsiz qoldirib, oddiy matn chizardi. Natijada owner "Rus tili F-3 —
// 16 o'quvchi" ni bosardi va hech narsa bo'lmasdi, holbuki panelning butun
// maqsadi - muammodan uning manbasiga o'tish.
//
// FILIAL subyekti ATAYLAB havola qilinmaydi. Serverda u `/owner/branches` ga
// ketadi, yakka markaz rejimida esa bu marshrut MultiBranchGuard orqali
// `/owner/settings/markaz` ga yo'naltiriladi - ya'ni "Bo'sh dars vaqtlari"
// maslahatini bosgan odam Sozlamalarda paydo bo'ladi. Filial baribir
// "batafsil ko'riladigan" subyekt emas; kurs uchun server o'zi null beradi
// (kurs profili sahifasi hali yo'q).
const NON_DRILLABLE_SUBJECTS = new Set(["branch"]);

const Row = ({ insight, isOpportunity }) => {
  const href = NON_DRILLABLE_SUBJECTS.has(insight.subjectType)
    ? null
    : insight.subjectHref;

  const inner = (
    <>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-sm font-medium text-foreground transition-colors",
            href && "group-hover/row:text-primary",
          )}
        >
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
    </>
  );

  if (!href) {
    return (
      <li className="flex items-start justify-between gap-3 py-2">{inner}</li>
    );
  }

  return (
    <li>
      {/* `-mx-2 px-2` - hover foni matn ustunidan bir oz chetga chiqadi,
          shunda qator "bosiladigan qator" bo'lib ko'rinadi. */}
      <Link
        to={href}
        className="group/row -mx-2 flex items-start justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
      >
        {inner}
      </Link>
    </li>
  );
};

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
 * @param {object}   data       - /ai/insights/domain/:domain javobi
 * @param {boolean}  isLoading
 * @param {string}   title      - panel sarlavhasi (mas. "Moliya bo'yicha AI tahlili")
 * @param {Function} icon       - sarlavha ikonkasi. Default `Sparkles` (AI belgisi).
 *                                Hamma insight ham til modelidan chiqmaydi: bir
 *                                qismi oddiy qoida/statistika (guruh to'ldirilishi,
 *                                bo'sh dars vaqtlari). O'sha sahifalar buni
 *                                "Tizim tahlili" deb atab, neytral ikonka beradi -
 *                                shuning uchun ikonka propga chiqarilgan.
 */
const AiDomainPanel = ({
  data,
  isLoading,
  title = "AI tahlili",
  icon: TitleIcon = Sparkles,
  className = "",
}) => {
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
          <TitleIcon className="size-4 text-primary" />
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
