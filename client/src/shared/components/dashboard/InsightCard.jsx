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
 * MAYDONLAR SERVER MODELIDAN OLINGAN — `server/src/models/insight.model.js`
 * (taxmin emas, o'qib tekshirilgan):
 *
 *   {
 *     _id:           ObjectId,        // `id` EMAS (Mongo hujjati)
 *     stance:        "risk" | "opportunity",
 *     severity:      "high" | "medium" | "low",
 *     title:         string,
 *     narration:     string | null,   // matnli tushuntirish (`reason` EMAS)
 *     factors:       [{ key, label, value, unit }],  // narration bo'lmasa
 *     confidence:    number,          // ⚠ [0, 1] — FOIZ EMAS
 *     expectedImpact:{ amount, currency, label },
 *     recommendedActions: [{ key, label, dueInDays }],  // ⚠ MASSIV
 *     subjectLabel:  string,
 *     subjectHref:   string | null,
 *     generatedAt / createdAt: Date,
 *   }
 *
 * ═══════════════════════════════════════════════════════════════════
 * ISHONCH DARAJASI — IKKI QOIDA, IKKALASI HAM MODELDAN
 *
 * 1) MIQYOS. `confidence` [0, 1] oralig'ida (model: `min: 0, max: 1`).
 *    Ilgari bu yerda `Math.round(insight.confidence)` yozilgan edi:
 *    haqiqiy 0.87 ekranda "Ishonch 1%", 0.4 esa "Ishonch 0%" bo'lib
 *    chiqardi. Ya'ni karta o'zi taqiqlagan narsani qilardi - raqam
 *    TO'QIB CHIQARARDI. Foizga o'girish SHU YERDA bo'ladi.
 *
 * 2) OSTONA. Modelda ochiq yozilgan: "UI qoidasi: < 0.4 bo'lsa ball
 *    ko'rsatilmaydi". Ikki oylik ma'lumot asosida "87%" ko'rsatish
 *    yolg'on aniqlik. Kodbazadagi mavjud komponentlar (AiStudentsAtRisk,
 *    AiTopTeachers, AiRiskBadge) ayni ostonaga tayanadi.
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

/**
 * Ishonch ostonasi - serverdagi `confidenceFloor` standarti bilan bir xil
 * (`schema.prisma`: `confidenceFloor Float @default(0.4)`).
 */
const CONFIDENCE_FLOOR = 0.4;

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

const InsightCard = ({
  insight,
  /**
   * Tavsiya amalini MANZILGA aylantiradi: `(action, insight) => href|null`.
   *
   * NEGA PROP: server `recommendedActions[].key` (masalan "call_debtors")
   * beradi, HAVOLA EMAS. Kalitni manzilga aylantiruvchi jadval
   * `owner/features/ai/utils/dashboard.utils.js` ichida - u FEATURE'ning
   * ichki fayli va `shared` komponent undan import qila olmaydi (FSD).
   *
   * Berilmasa karta `subjectHref` ga tushadi, u ham bo'lmasa amal
   * ODDIY MATN bo'lib qoladi. Ishlamaydigan havola 404 ga olib boradi
   * va butun ekranga ishonchni yo'qotadi.
   */
  resolveActionHref,
  onDismiss,
  className = "",
}) => {
  if (!insight) return null;

  const tone = toneOf(insight);
  const isOpportunity = insight.stance === "opportunity";
  const Icon = isOpportunity ? Lightbulb : TriangleAlert;

  const amount = insight.expectedImpact?.amount;
  const hasAmount = typeof amount === "number" && Number.isFinite(amount) && amount !== 0;

  // [0,1] -> foiz, 0.4 ostonasi bilan. Oraliqdan tashqari qiymat
  // KO'RSATILMAYDI: u shakl buzilgani belgisi, uni "tuzatib" chiqarish
  // yana o'sha to'qib chiqarish bo'lardi.
  const raw = insight.confidence;
  const confidence =
    typeof raw === "number" && Number.isFinite(raw) && raw >= CONFIDENCE_FLOOR && raw <= 1
      ? Math.round(raw * 100)
      : null;

  // Server MASSIV yuboradi. Birinchisi - asosiy amal (server ularni
  // muhimlik bo'yicha tartiblaydi).
  const action = insight.recommendedActions?.[0] || insight.recommendedAction || null;

  // Tushuntirish: avval matnli `narration`, bo'lmasa omillar ro'yxati.
  // `reason` degan maydon serverda YO'Q edi - karta hech qachon
  // sabab ko'rsatmasdi.
  const explanation =
    insight.narration ||
    (insight.factors?.length
      ? insight.factors
          .map((f) => [f.label, f.value != null ? `${f.value}${f.unit || ""}` : null]
            .filter(Boolean).join(": "))
          .join(" · ")
      : null);

  // Amal manzili: chaqiruvchining jadvalidan -> subyekt sahifasi -> yo'q.
  const actionHref =
    (action && resolveActionHref?.(action, insight)) || insight.subjectHref || null;

  const created = relativeUz(insight.generatedAt || insight.createdAt);

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

      {explanation && (
        <p className="mt-1 pl-2 text-sm leading-relaxed text-muted-foreground">
          {explanation}
        </p>
      )}

      {insight.expectedImpact?.label && !hasAmount && (
        <p className="mt-1 pl-2 text-xs text-muted-foreground">
          {insight.expectedImpact.label}
        </p>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pl-2 pt-4">
        {action?.label &&
          (actionHref ? (
            <Link
              to={actionHref}
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
