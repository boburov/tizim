import { Link } from "react-router-dom";
import { ArrowRight, ExternalLink, Lightbulb } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { actionHref, levelStyle } from "../../utils/dashboard.utils";

// AI TAVSIYALARI - "nima qilsam biznes o'sadi".
//
// NEGA OGOHLANTIRISHLARDAN ALOHIDA: aralashtirilgan ro'yxatda owner
// imkoniyatni "yana bir muammo" deb o'qiydi va ikkalasiga ham e'tibor
// bermay qo'yadi. Xavf — "yo'qotmaslik uchun", imkoniyat — "ko'proq
// olish uchun"; ular turli kayfiyatda o'qiladi va turli vaqtda
// bajariladi.
//
// HAR BIR KARTADA BITTA TUGMA. Tavsiya matnining o'zi tugma bo'ladi
// va aynan ish qilinadigan ekranga olib boradi - "bir bosishda
// harakat" degani shu. Manzili topilmagan tavsiya oddiy matn bo'lib
// qoladi: ishlamaydigan havola 404 ga olib boradi va butun sahifaga
// ishonchni yo'qotadi.

const style = levelStyle("info");

const RecommendationCard = ({ insight, onResolve }) => {
  const action = insight.recommendedActions?.[0];
  const href = actionHref(action, insight);
  const upside = insight.expectedImpact?.amount || 0;

  return (
    <article className="flex h-full flex-col rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              style.chip,
            )}
          >
            <Lightbulb className="size-3" />
            {style.label}
          </span>
          {insight.subjectHref ? (
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
          )}
        </div>

        {upside > 0 && (
          <span className={cn("shrink-0 text-sm font-semibold tabular-nums", style.text)}>
            +{formatMoneyShort(upside)}
          </span>
        )}
      </header>

      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {insight.title || insight.expectedImpact?.label}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-4">
        {action && href ? (
          <Link
            to={href}
            className="group inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {action.label}
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          action && <span className="text-sm text-foreground">{action.label}</span>
        )}

        {onResolve && (
          <button
            type="button"
            onClick={() => onResolve(insight)}
            className="ml-auto text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Bajarildi
          </button>
        )}
      </div>
    </article>
  );
};

const AiRecommendations = ({ items = [], limit = 4, onResolve }) => (
  <div className="grid gap-3 lg:grid-cols-2">
    {items.slice(0, limit).map((insight) => (
      <RecommendationCard key={insight._id} insight={insight} onResolve={onResolve} />
    ))}
  </div>
);

export default AiRecommendations;
