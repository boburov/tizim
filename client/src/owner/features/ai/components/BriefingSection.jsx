import { cn } from "@/shared/utils/cn";
import AiMetricTile from "./AiMetricTile";

// BRIFING BO'LIMI - to'rtta savoldan bittasi.
//
// TUZILISH QAT'IY: savol → raqamlar → AI izohi. Izoh HAR DOIM raqamlardan
// KEYIN va HAR DOIM bor. "AI hech qachon faqat xom statistika
// ko'rsatmasin" talabi aynan shu komponentda bajariladi: narration
// bo'lmasa ham bo'lim izohsiz chiqmaydi, o'rniga halol "ma'lumot yetarli
// emas" matni ko'rsatiladi.

const BriefingSection = ({
  step,
  question,
  hint,
  icon: Icon,
  tone = "text-muted-foreground",
  metrics = [],
  narration,
  children,
  className = "",
}) => (
  <section className={cn("space-y-3", className)}>
    <header className="flex items-start gap-3">
      {Icon && (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className={cn("size-4", tone)} />
        </span>
      )}
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          {step != null && (
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {step}
            </span>
          )}
          <h2 className="text-base font-semibold text-foreground">{question}</h2>
        </div>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
    </header>

    {metrics.length > 0 && (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => (
          <AiMetricTile key={m.key} metric={m} />
        ))}
      </div>
    )}

    {/* AI IZOHI - raqamlarning MA'NOSI, ularning takrori EMAS.
        Chap chegara chizig'i uni ko'rsatkichlardan vizual ajratadi:
        bu o'lchov emas, talqin.

        Izoh bo'lmasa quti UMUMAN chizilmaydi. Ilgari bu yerda
        "Bu bo'lim uchun yetarli ma'lumot yig'ilmagan" turardi - bo'sh
        quti ham, uning ichidagi uzr ham ekranda xuddi shunday joy
        egallardi va sahifani "ko'p gapiradigan" qilardi. */}
    {narration && (
      <div className="rounded-xl border border-l-2 border-l-primary bg-card p-4">
        <p className="text-sm leading-relaxed text-foreground">{narration}</p>
      </div>
    )}

    {children}
  </section>
);

export default BriefingSection;
