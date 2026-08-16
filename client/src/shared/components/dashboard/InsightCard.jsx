// Router
import { Link } from "react-router-dom";

// Icons
import { ArrowRight, ExternalLink, Lightbulb, TriangleAlert } from "lucide-react";

// Utils
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";

/**
 * TAVSIYA / OGOHLANTIRISH KARTASI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * KUTILAYOTGAN MA'LUMOT SHAKLI (`insight`)
 *
 * Bu shakl `owner/features/ai` dagi mavjud yozuvlar va PROMT.MD dagi
 * talabdan olingan. HECH BIR MAYDON MAJBURIY EMAS - yo'q maydon
 * KO'RSATILMAYDI, o'ylab topilmaydi.
 *
 *   {
 *     id:            string,
 *     stance:        "risk" | "opportunity",
 *     severity:      "high" | "medium" | "low",
 *     title:         string,          // "7 o'quvchi ketish arafasida"
 *     reason:        string,          // nega shunday deb o'ylanmoqda
 *     confidence:    number,          // 0..100  — YO'Q BO'LSA CHIQMAYDI
 *     expectedImpact:{ amount?: number, label?: string },
 *     recommendedAction: { label: string, href?: string },
 *     subjectLabel:  string,
 *     subjectHref:   string,          // drill-down manzili
 *     createdAt:     string | Date,
 *   }
 *
 * ISHONCH DARAJASI HAQIDA: `confidence` bo'lmasa karta uni umuman
 * ko'rsatmaydi. ATAYLAB standart qiymat yo'q - "100%" ham, "—" ham
 * yozilmaydi. Ishonch darajasi modelning o'z bahosi; uni interfeys
 * to'qib chiqarsa, butun tavsiya tizimiga bo'lgan ishonch yo'qoladi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * RANGLAR `ai/utils/dashboard.utils.js` dagi LEVEL_STYLES bilan bir
 * xil qiymatlarda - ikki ekranda ikki xil "ogohlantirish qizili"
 * bo'lib qolmasligi uchun. U yerdagi izohda yozilganidek, status
 * ranglari semantik token EMAS (ular ma'no tashiydi), lekin har
 * birining `dark:` varianti bor.
 */

const TONE = {
  high: {
    label: "Yuqori",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    accent: "bg-rose-500",
    amount: "text-rose-600 dark:text-rose-400",
  },
  medium: {
    label: "O'rta",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    accent: "bg-amber-500",
    amount: "text-amber-600 dark:text-amber-400",
  },
  low: {
    label: "Past",
    chip: "bg-muted text-muted-foreground",
    accent: "bg-border",
    amount: "text-muted-foreground",
  },
  opportunity: {
    label: "Imkoniyat",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    accent: "bg-sky-500",
    amount: "text-sky-600 dark:text-sky-400",
  },
};

const toneOf = (insight) =>
  insight?.stance === "opportunity"
    ? TONE.opportunity
    : TONE[insight?.severity] || TONE.low;

/** "2 soat oldin" - aniq soatdan ko'ra tushunarli. */
const relativeUz = (dateLike) => {
  if (!dateLike) return null;
  const diff = Date.now() - new Date(dateLike).getTime();
  if (Number.isNaN(diff)) return null;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.round(hours / 24)} kun oldin`;
};

const InsightCard = ({ insight, onDismiss, className = "" }) => {
  if (!insight) return null;

  const tone = toneOf(insight);
  const isOpportunity = insight.stance === "opportunity";
  const Icon = isOpportunity ? Lightbulb : TriangleAlert;

  const amount = insight.expectedImpact?.amount;
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount !== 0;

  const confidence =
    typeof insight.confidence === "number" && Number.isFinite(insight.confidence)
      ? Math.round(insight.confidence)
      : null;

  const action = insight.recommendedAction;
  const created = relativeUz(insight.createdAt);

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-md border bg-card p-4",
        className,
      )}
    >
      {/* Chap chekkadagi daraja chizig'i - ro'yxatni skanerlashda
          matnni o'qimasdan ham jiddiylik ko'rinadi. */}
      <span className={cn("absolute inset-y-0 left-0 w-1", tone.accent)} aria-hidden />

      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pl-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tone.chip,
            )}
          >
            <Icon className="size-3" />
            {tone.label}
          </span>

          {insight.subjectLabel &&
            (insight.subjectHref ? (
              <Link
                to={insight.subjectHref}
                className="group inline-flex min-w-0 items-center gap-1"
              >
                <span className="truncate font-semibold text-foreground group-hover:underline">
                  {insight.subjectLabel}
                </span>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <span className="truncate font-semibold text-foreground">
                {insight.subjectLabel}
              </span>
            ))}
        </div>

        {/* Ta'sir summasi - FAQAT server bergan bo'lsa. */}
        {hasAmount && (
          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", tone.amount)}>
            {isOpportunity ? "+" : ""}
            {formatMoneyShort(amount)}
          </span>
        )}
      </header>

      {insight.title && (
        <p className="mt-1.5 pl-2 text-sm font-medium leading-relaxed text-foreground">
          {insight.title}
        </p>
      )}

      {insight.reason && (
        <p className="mt-1 pl-2 text-sm leading-relaxed text-muted-foreground">
          {insight.reason}
        </p>
      )}

      {insight.expectedImpact?.label && !hasAmount && (
        <p className="mt-1 pl-2 text-xs text-muted-foreground">
          {insight.expectedImpact.label}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pl-2 pt-4">
        {action?.label &&
          (action.href ? (
            <Link
              to={action.href}
              className="group inline-flex items-center gap-1 text-sm font-medium text-primary"
            >
              {action.label}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            // Manzilsiz tavsiya oddiy matn bo'lib qoladi. Ishlamaydigan
            // havola 404 ga olib boradi va butun ekranga ishonchni yo'qotadi.
            <span className="text-sm font-medium text-muted-foreground">
              {action.label}
            </span>
          ))}

        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {confidence !== null && <span className="tabular-nums">Ishonch {confidence}%</span>}
          {created && <span>{created}</span>}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(insight)}
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Yashirish
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};

export default InsightCard;
