import { UserMinus, Clock, TrendingDown } from "lucide-react";
import StatCard from "@/shared/components/ui/card/StatCard";
import { formatMonths } from "../utils/formatMonths";

const RetentionStatCards = ({ data, onShowChurned }) => {
  if (!data) return null;

  // Erta chiqib ketganlar = 3 oydan kam o'qib ketganlar (0-1 va 1-3 oy kohortalari).
  // "O'quvchilar ushlanmayapti" muammosini darrov ko'rsatadi - owner uchun amaliy.
  const buckets = data.durationBuckets || [];
  const earlyLeavers = buckets
    .filter((b) => b.key === "0-1" || b.key === "1-3")
    .reduce((s, b) => s + (b.count || 0), 0);
  const earlyPct = data.totalChurned
    ? Math.round((earlyLeavers / data.totalChurned) * 100)
    : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        icon={UserMinus}
        label="Jami chiqib ketgan"
        value={data.totalChurned}
        tone="negative"
        hint="Ro'yxatni ko'rish uchun bosing"
        onClick={onShowChurned}
      />
      <StatCard
        icon={Clock}
        label="O'rtacha o'qish muddati"
        value={data.avgDurationMonths}
        suffix=" oy"
        tone="warn"
        hint={`Chiqishdan oldin: ${formatMonths(data.avgDurationMonths)}`}
      />
      <StatCard
        icon={TrendingDown}
        label="Erta chiqib ketganlar"
        value={earlyPct}
        suffix="%"
        tone="negative"
        hint={`${earlyLeavers} ta o'quvchi 3 oydan kam o'qigan`}
      />
    </div>
  );
};

export default RetentionStatCards;
