import { cn } from "@/shared/utils/cn";
import { levelStyle, scoreLevel } from "../../utils/dashboard.utils";

// BALL HALQASI - "biznes qanday?" savoliga bitta raqamli javob.
//
// NEGA HALQA, USTUN EMAS: bu son o'zga sonlar bilan TAQQOSLANMAYDI
// (bitta qiymat, bitta lahza). Ustun diagramma taqqoslash uchun, halqa
// esa "to'liqlik" uchun - va aynan shu ma'no kerak: 100 dan nechtasi.
//
// RANG YOLG'IZ EMAS: halqa ichida raqam, ostida esa daraja nomi
// ("Diqqat") turadi. Rang ko'r-ko'rona signal bo'lsa, rang ajratmaydigan
// foydalanuvchi uchun sahifa ma'nosini yo'qotardi.

const ScoreRing = ({ score, size = 96, stroke = 8, label, className = "" }) => {
  const level = scoreLevel(score);
  const style = levelStyle(level);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Ma'lumot yo'q bo'lsa halqa BO'SH - nol emas. Nol "juda yomon"
  // degani, ma'lumotsizlik esa boshqa narsa.
  const filled = score == null ? 0 : (Math.max(0, Math.min(100, score)) / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-muted"
          />
          {score != null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${filled} ${circumference}`}
              className={cn("transition-[stroke-dasharray] duration-700", {
                "stroke-rose-500": level === "critical",
                "stroke-amber-500": level === "warning",
                "stroke-emerald-500": level === "good",
              })}
            />
          )}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn(
              "font-semibold tabular-nums leading-none text-foreground",
              size >= 88 ? "text-2xl" : "text-lg",
            )}
          >
            {score == null ? "—" : score}
          </span>
          {label && (
            <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
          )}
        </div>
      </div>

      <span className={cn("text-xs font-medium", style.text)}>{style.label}</span>
    </div>
  );
};

export default ScoreRing;
