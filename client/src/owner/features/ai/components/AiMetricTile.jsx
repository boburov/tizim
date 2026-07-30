import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { deltaTone, formatDelta, formatMetric } from "../utils/metric.utils";

// Bitta ko'rsatkich katakchasi - brifing va hisobot bo'limlarida bir xil.
//
// Qiymat + o'zgarish + IZOH (hint) birga turadi. Yalang'och son ("142")
// hech narsa demaydi; "142 ta · 8 guruh" esa o'zini o'zi tushuntiradi.

const AiMetricTile = ({ metric }) => {
  if (!metric) return null;
  const { key, label, value, unit, delta, hint } = metric;

  const tone = deltaTone(key, delta);
  const text = formatDelta(delta);
  const Icon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {formatMetric(value, unit)}
        </span>
        {/* "so'm" ni formatMoney() O'ZI qo'shadi - bu yerda takrorlash
            "0 so'm so'm" berardi. Qiymat yo'q bo'lsa ("—") birlik ham
            ko'rsatilmaydi: "— %" hech narsani anglatmaydi. */}
        {unit && unit !== "so'm" && value != null && (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs">
        {text && (
          <span className={cn("inline-flex items-center gap-0.5 tabular-nums", tone)}>
            <Icon className="size-3" />
            {text}
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
};

export default AiMetricTile;
