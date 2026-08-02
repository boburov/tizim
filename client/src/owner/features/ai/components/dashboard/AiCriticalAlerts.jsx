import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import { actionHref, levelStyle, severityLevel } from "../../utils/dashboard.utils";

// KRITIK OGOHLANTIRISHLAR - "hozir nima buzilgan".
//
// TARTIB BACKEND'DAN KELADI va u yerda `priority` (ta'sir × ehtimol ×
// shoshilinchlik) bo'yicha saralangan. Bu yerda QAYTA saralamaymiz:
// ikkita saralash qoidasi ertami-kechmi ayrilib ketadi va owner bir
// xil ro'yxatni ikki sahifada ikki xil tartibda ko'radi.
//
// ZICH QATOR, KARTA EMAS. Har bir muammoni to'liq karta bilan
// ko'rsatish (sabab chiziqlari, manba havolalari, tavsiyalar ro'yxati)
// beshta ogohlantirishni ikki ekran uzunlikda cho'zardi — va aynan
// shunda owner ro'yxatning oxirini hech qachon ko'rmaydi. Shuning
// uchun: bitta qator = bitta muammo + bitta tugma, tafsilot esa
// "Batafsil" ostida.
//
// HAR BIR OGOHLANTIRISHDA HARAKAT BOR. Tavsiyasiz ogohlantirish -
// bu tashvish, vazifa emas: owner uni o'qiydi, xavotirlanadi va hech
// narsa qilmaydi.

const MODEL_LABELS = {
  Attendance: "Davomat yozuvlari",
  Grade: "Baholar",
  StudentPayment: "To'lovlar",
  PaymentTransaction: "To'lov tranzaksiyalari",
};

/** Faktorning umumiy ballga qo'shgan hissasi - vizual ulush chizig'i. */
const FactorRow = ({ factor, maxContribution }) => {
  const width = maxContribution > 0 ? (factor.contribution / maxContribution) * 100 : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-foreground">{factor.label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {factor.value}
          {factor.unit ? ` ${factor.unit}` : ""}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${Math.max(2, width)}%` }}
        />
      </div>
    </li>
  );
};

const AlertRow = ({ insight, onAck, onResolve, onDismiss }) => {
  const [open, setOpen] = useState(false);

  const level = severityLevel(insight.severity, insight.stance);
  const style = levelStyle(level);

  const action = insight.recommendedActions?.[0];
  const href = actionHref(action, insight);
  const impact = insight.expectedImpact?.amount || 0;

  // Faqat haqiqiy hissa qo'shgan faktorlar - "0% ga pasaydi" kabi
  // bo'sh qatorlar tafsilotni shovqinga to'ldiradi.
  const factors = (insight.factors || []).filter((f) => f.normalized > 0.05);
  const maxContribution = factors[0]?.contribution || 0;

  return (
    <li className={cn("overflow-hidden rounded-xl border border-l-[3px] bg-card", style.border)}>
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                style.chip,
              )}
            >
              {style.label}
            </span>
            {/* ISM BOSILADIGAN. Owner "Aziz Karimov ketish arafasida"
                ni o'qigach darhol "kim bu?" deydi - ismni qidiruvga
                qo'lda kiritish har kuni takrorlanadigan ishqalanish. */}
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

          {impact > 0 && (
            <span className={cn("shrink-0 text-sm font-semibold tabular-nums", style.text)}>
              {formatMoneyShort(impact)}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {insight.title || insight.expectedImpact?.label}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* BIR BOSISHDA HARAKAT: tavsiya matnining o'zi tugma bo'ladi
              va aynan ish qilinadigan ekranga olib boradi. */}
          {action && href && (
            <Link
              to={href}
              className="group inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {action.label}
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
          {action && !href && (
            <span className="text-sm text-foreground">{action.label}</span>
          )}

          {insight.status === "open" && onAck && (
            <button
              type="button"
              onClick={() => onAck(insight)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Ko'rdim
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={open}
          >
            {open ? "Yopish" : "Batafsil"}
            <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </button>
        </div>
      </div>

      {/* TAFSILOT - progressiv ochilish. Ichida "AI nega shunday
          o'yladi" turadi: sabablar, ularning ulushi va MANBA
          havolalari. Manbasiz baho "ishonchli ko'rinadigan taxmin"
          bo'lib qoladi va bir marta aldangan owner butun sahifaga
          ishonmay qo'yadi. */}
      {open && (
        <div className="space-y-4 border-t border-border bg-muted/30 p-4">
          {insight.narration && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {insight.narration}
            </p>
          )}

          {factors.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sabablar
              </h4>
              <ul className="space-y-2">
                {factors.map((f) => (
                  <FactorRow key={f.key} factor={f} maxContribution={maxContribution} />
                ))}
              </ul>
            </div>
          )}

          {insight.sourceRefs?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {insight.sourceRefs.map((ref) => (
                <Link
                  key={`${ref.model}-${ref.href}`}
                  to={ref.href}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {MODEL_LABELS[ref.model] || ref.model}
                  <span className="tabular-nums">({ref.total})</span>
                  <ExternalLink className="size-3" />
                </Link>
              ))}
            </div>
          )}

          {insight.recommendedActions?.length > 1 && (
            <div>
              <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Boshqa tavsiyalar
              </h4>
              <ul className="space-y-1">
                {insight.recommendedActions.slice(1).map((a) => (
                  <li key={a.key} className="text-sm text-foreground">
                    {a.label}
                    {a.dueInDays != null && (
                      <span className="ml-1 text-muted-foreground">
                        ({a.dueInDays} kun ichida)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
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
          </div>
        </div>
      )}
    </li>
  );
};

const AiCriticalAlerts = ({ items = [], limit = 5, ...handlers }) => (
  <ul className="space-y-2.5">
    {items.slice(0, limit).map((insight) => (
      <AlertRow key={insight._id} insight={insight} {...handlers} />
    ))}
  </ul>
);

export default AiCriticalAlerts;
