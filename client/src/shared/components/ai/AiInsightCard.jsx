import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import AiRiskBadge from "./AiRiskBadge";

// AI tavsiya kartasi - Apple uslubidagi toza karta.
//
// Gemini'ning majburiy qoidasi shu yerda amalga oshadi: har bir sabab
// ORTIDA bosiladigan havola turadi (sourceRefs). Havolasiz insight
// "ishonchli ko'rinadigan taxmin" bo'lib qoladi va aynan shu narsa
// owner ishonchini bir marotaba va butunlay yo'qotadi.

const MODEL_LABELS = {
  Attendance: "Davomat yozuvlari",
  Grade: "Baholar",
  StudentPayment: "To'lovlar",
};

/** Faktorning umumiy ballga qo'shgan hissasi - vizual ulush chizig'i. */
const FactorRow = ({ factor, maxContribution }) => {
  const width = maxContribution > 0 ? (factor.contribution / maxContribution) * 100 : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-foreground">{factor.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {factor.value}
          {factor.unit ? ` ${factor.unit}` : ""}
        </span>
      </div>
      {/* Ulush chizig'i: qaysi sabab ballni ko'proq ko'targanini ko'rsatadi.
          Owner "nega 82%?" degan savolga shu yerdan javob topadi. */}
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${Math.max(2, width)}%` }}
        />
      </div>
    </li>
  );
};

const AiInsightCard = ({
  insight,
  confidenceFloor = 0.4,
  onAck,
  onResolve,
  onDismiss,
  compact = false,
  className = "",
}) => {
  if (!insight) return null;

  const {
    subjectLabel,
    subjectHref,
    severity,
    score,
    confidence,
    factors = [],
    sourceRefs = [],
    recommendedActions = [],
    expectedImpact,
    narration,
    status,
  } = insight;

  // Faqat haqiqiy hissa qo'shgan faktorlar - "0% ga pasaydi" kabi bo'sh
  // qatorlar kartani shovqinga to'ldiradi.
  const active = factors.filter((f) => f.normalized > 0.05);
  const maxContribution = active[0]?.contribution || 0;

  return (
    <article
      className={cn(
        "rounded-xl border bg-card p-4 xs:p-5",
        status === "acked" && "border-primary/40",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* ISM BOSILADIGAN - to'g'ridan-to'g'ri profilga.
              Ilgari bu oddiy matn edi va owner "Aziz Karimov ketish
              arafasida" ni o'qigach ismni qidiruvga QO'LDA kiritishga
              majbur bo'lardi. Har kuni 20 ta karta ustida takrorlanadigan
              bu ishqalanish aynan sahifani ochishni to'xtatadigan narsa.

              subjectHref null bo'lsa (kurs kabi profil sahifasi yo'q
              turlar, va eski insight'lar) - oddiy matn. Ishlamaydigan
              havola 404 ga olib boradi va butun sahifaga ishonchni
              yo'qotadi. */}
          {subjectHref ? (
            <Link
              to={subjectHref}
              className="group inline-flex max-w-full items-center gap-1"
            >
              <h3 className="truncate font-semibold text-foreground group-hover:underline">
                {subjectLabel}
              </h3>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ) : (
            <h3 className="truncate font-semibold text-foreground">{subjectLabel}</h3>
          )}
          {expectedImpact?.label && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {expectedImpact.label}
            </p>
          )}
        </div>
        <AiRiskBadge
          score={score}
          confidence={confidence}
          severity={severity}
          confidenceFloor={confidenceFloor}
        />
      </header>

      {narration && !compact && (
        <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
          {narration}
        </p>
      )}

      {active.length > 0 && !compact && (
        <section className="mt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sabablar
          </h4>
          <ul className="space-y-2.5">
            {active.map((f) => (
              <FactorRow key={f.key} factor={f} maxContribution={maxContribution} />
            ))}
          </ul>
        </section>
      )}

      {/* "Ishingni ko'rsat" havolalari - har bir raqamni tekshirsa bo'ladi. */}
      {sourceRefs.length > 0 && !compact && (
        <section className="mt-4 flex flex-wrap gap-2">
          {sourceRefs.map((ref) => (
            <Link
              key={`${ref.model}-${ref.href}`}
              to={ref.href}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {MODEL_LABELS[ref.model] || ref.model}
              <span className="tabular-nums">({ref.total})</span>
              <ExternalLink className="size-3" />
            </Link>
          ))}
        </section>
      )}

      {recommendedActions.length > 0 && (
        <section className="mt-4">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tavsiya
          </h4>
          <ul className="space-y-1.5">
            {recommendedActions.map((a) => (
              <li key={a.key} className="flex items-start gap-1.5 text-sm">
                <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-foreground">
                  {a.label}
                  {a.dueInDays != null && (
                    <span className="ml-1 text-muted-foreground">
                      ({a.dueInDays} kun ichida)
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(onAck || onResolve || onDismiss) && (
        <footer className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
          {onAck && status === "open" && (
            <button
              type="button"
              onClick={() => onAck(insight)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Ko'rdim
            </button>
          )}
          {onResolve && (
            <button
              type="button"
              onClick={() => onResolve(insight)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Bajarildi
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(insight)}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              To'g'ri emas
            </button>
          )}
        </footer>
      )}
    </article>
  );
};

export default AiInsightCard;
