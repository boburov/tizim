import { TrendingUp, Minus } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { formatMoneyShort } from "@/shared/utils/formatMoney";
import isMissing from "./isMissing";

/**
 * OLDINGI DAVR BILAN TAQQOSLASH belgisi.
 *
 * Backend `compare()` shaklini qaytaradi:
 *   { current, previous, change, changePercent }
 *
 * `changePercent === null` → oldingi davrda qiymat NOL edi, ya'ni
 * o'sishni foizda ifodalab bo'lmaydi. Bunday holatda "+∞%" yoki "0%"
 * emas, MUTLAQ o'zgarish ko'rsatiladi ("+5,2 mln") — bu halol va
 * baribir foydali.
 *
 * ── RANG QOIDASI ──
 * O'sish HAR DOIM yaxshi emas: xarajat va qarzdorlik o'sishi YOMON.
 * Shuning uchun `invert` bayrog'i bor va u chaqiruv joyida ochiq
 * beriladi — komponent o'zi taxmin qilmaydi.
 */
const ComparisonBadge = ({ compare, invert = false, className }) => {
  if (!compare) return null;
  const { change, changePercent } = compare;

  if (isMissing(change) && isMissing(changePercent)) return null;

  const noChange = change === 0;
  const up = Number(change) > 0;
  // `invert` — o'sish yomon bo'lgan ko'rsatkichlar uchun (xarajat, qarz).
  const good = invert ? !up : up;

  const tone = noChange
    ? "bg-muted text-muted-foreground"
    : good
      ? "bg-success/10 text-success"
      : "bg-destructive/10 text-destructive";

  const label = isMissing(changePercent)
    ? `${up ? "+" : ""}${formatMoneyShort(change)}`
    : `${changePercent > 0 ? "+" : ""}${changePercent}%`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tone,
        className,
      )}
      title={
        isMissing(changePercent)
          ? "Oldingi davrda qiymat nol edi — foizda taqqoslab bo'lmaydi"
          : `Oldingi davr: ${formatMoneyShort(compare.previous)}`
      }
    >
      {noChange ? (
        <Minus className="size-3" />
      ) : (
        <TrendingUp className={cn("size-3", !up && "rotate-180")} />
      )}
      {label}
    </span>
  );
};

export default ComparisonBadge;
