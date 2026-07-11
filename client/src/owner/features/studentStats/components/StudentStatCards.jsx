// Icons
import { GraduationCap, Clock, UserPlus, Layers } from "lucide-react";

// Components
import StatCard from "@/shared/components/ui/card/StatCard";

// O'rtacha davomiylikni (oyda) "1 yil 3 oy" ko'rinishida.
const formatAvgDuration = (months) => {
  if (!months || months <= 0) return "0 oy";
  const y = Math.floor(months / 12);
  const m = Math.round(months - y * 12);
  const parts = [];
  if (y > 0) parts.push(`${y} yil`);
  if (m > 0) parts.push(`${m} oy`);
  return parts.join(" ") || "0 oy";
};

const StudentStatCards = ({ data, stats, mode = "ongoing" }) => {
  if (!data) return null;

  // Joriy oyda qo'shilganlar (trendning oxirgi elementi).
  const trend = data.enrollmentTrend || [];
  const thisMonth = trend.length ? trend[trend.length - 1].count : 0;

  // Muddat ko'rsatkichlari tanlangan rejimga (ongoing/finished) bog'liq.
  const avgDurationMonths = stats?.avgDurationMonths ?? 0;
  const isFinished = mode === "finished";

  // Eng katta kohorta (ko'pchilik qancha vaqt ro'yxatda turgan).
  const cohorts = stats?.cohorts || [];
  const topCohort = cohorts.reduce(
    (best, c) => (c.count > (best?.count ?? -1) ? c : best),
    null,
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={GraduationCap}
        label="Faol o'quvchilar"
        value={data.activeCount}
        hint="Jami faol o'quvchilar"
        to="/owner/users"
      />
      <StatCard
        icon={UserPlus}
        label="Yangi (shu oy)"
        value={thisMonth}
        tone="positive"
        hint="Shu oy ro'yxatga olinganlar"
      />
      <StatCard
        icon={Clock}
        label={isFinished ? "O'rtacha yakunlash muddati" : "O'rtacha ro'yxat muddati"}
        value={avgDurationMonths}
        suffix=" oy"
        tone="info"
        hint={formatAvgDuration(avgDurationMonths)}
      />
      <StatCard
        icon={Layers}
        label="Ko'pchilik muddati"
        value={topCohort?.count ?? 0}
        tone="default"
        hint={
          topCohort
            ? `${topCohort.label} (${isFinished ? "yakunlagan" : "o'qiyotgan"})`
            : "-"
        }
      />
    </div>
  );
};

export default StudentStatCards;
