import { Users, GraduationCap, XCircle, TrendingUp } from "lucide-react";
import StatCard from "@/shared/components/ui/card/StatCard";

const LeadKpiCards = ({ stats }) => {
  const byStatus = stats?.byStatus || {};
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard icon={Users} label="Jami lidlar" value={stats?.total || 0} />
      <StatCard
        icon={GraduationCap}
        label="O'quvchiga aylangan"
        value={byStatus.enrolled || 0}
        tone="positive"
      />
      <StatCard
        icon={XCircle}
        label="Rad etilgan"
        value={byStatus.rejected || 0}
        tone="negative"
      />
      <StatCard
        icon={TrendingUp}
        label="Umumiy konversiya"
        value={stats?.rates?.overallConversion || 0}
        suffix="%"
        tone="info"
      />
    </div>
  );
};

export default LeadKpiCards;
