import { cn } from "@/shared/utils/cn";

// AI xavf belgisi - ro'yxatlarda va profil sarlavhalarida ishlatiladi.
//
// ENG MUHIM QOIDA: ishonch past bo'lsa RAQAM KO'RSATILMAYDI.
// "12% xavf" degan raqam ikki ta dars asosida chiqarilgan bo'lsa - bu
// yolg'on aniqlik. Owner uni haqiqat deb qabul qiladi va bir marta
// aldangandan keyin butun tizimga ishonishni to'xtatadi.

const SEVERITY_STYLES = {
  // Status ranglari ma'no tashiydi, shuning uchun token emas - lekin
  // dark: variantisiz qorong'i rejimda o'qilmay qoladi.
  high: "bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30",
  medium:
    "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  low: "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30",
};

const SEVERITY_LABEL = { high: "Yuqori", medium: "O'rta", low: "Past" };

const AiRiskBadge = ({
  score,
  confidence,
  severity = "low",
  confidenceFloor = 0.4,
  showLabel = true,
  className = "",
}) => {
  // Ishonch yetarli emas - raqam o'rniga halol xabar.
  if (confidence != null && confidence < confidenceFloor) {
    return (
      <span
        title="Bu o'quvchi bo'yicha yetarli dars/to'lov tarixi yo'q — ball hisoblanmadi"
        className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
          "bg-muted text-muted-foreground border-border",
          className,
        )}
      >
        Ma'lumot yetarli emas
      </span>
    );
  }

  const pct = Math.round((score ?? 0) * 100);

  return (
    <span
      title={
        confidence != null
          ? `Ishonch: ${Math.round(confidence * 100)}%`
          : undefined
      }
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        SEVERITY_STYLES[severity] || SEVERITY_STYLES.low,
        className,
      )}
    >
      {showLabel && <span>{SEVERITY_LABEL[severity]}</span>}
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
};

export default AiRiskBadge;
