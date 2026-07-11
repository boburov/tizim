import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  CalendarDays,
  CalendarX,
} from "lucide-react";
import Card from "@/shared/components/ui/card/Card";
import { Skeleton } from "@/shared/components/shadcn/skeleton";
import LowAttendanceList from "./LowAttendanceList";
import TopAbsentList from "./TopAbsentList";
import GroupBreakdownTable from "./GroupBreakdownTable";
import useDashboardQuery from "../hooks/useDashboardQuery";

const StatCard = ({ icon: Icon, iconClass, label, value, valueClass = "text-gray-900", hint }) => (
  <Card className="flex items-center gap-3">
    <span className={`grid place-items-center size-10 shrink-0 rounded-lg ${iconClass}`}>
      <Icon className="size-5" />
    </span>
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold leading-tight ${valueClass}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  </Card>
);

const DashboardSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-lg shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-7 w-16" />
          </div>
        </Card>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card>
        <Skeleton className="h-5 w-32 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full mb-2" />
        ))}
      </Card>
      <Card>
        <Skeleton className="h-5 w-32 mb-3" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full mb-2" />
        ))}
      </Card>
    </div>
    <GroupBreakdownTable isLoading />
  </div>
);

const buildRange = (year, month) => {
  const fromDate = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const toDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();
  return { fromDate, toDate };
};

const GROUP_BREAKDOWN_LIMIT = 10;

// year/month - layout (Outlet context). Davr o'zgarganda qayta yuklanadi.
const AttendanceOverallPanel = () => {
  const { year, month } = useOutletContext();
  const range = useMemo(() => buildRange(year, month), [year, month]);
  const [groupPage, setGroupPage] = useState(1);

  const params = useMemo(
    () => ({ ...range, page: groupPage, limit: GROUP_BREAKDOWN_LIMIT }),
    [range, groupPage],
  );
  const { data, isLoading } = useDashboardQuery(params);

  if (isLoading) return <DashboardSkeleton />;
  if (!data) {
    return (
      <div className="border rounded-md bg-white p-12 text-center">
        <p className="text-muted-foreground">Tanlangan davr uchun davomat ma'lumotlari topilmadi</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          icon={TrendingUp}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Umumiy davomat"
          value={data.overallRate !== null ? `${data.overallRate}%` : "-"}
          valueClass="text-emerald-600"
        />
        <StatCard
          icon={Users}
          iconClass="bg-primary/10 text-primary"
          label="O'quvchilar soni"
          value={data.studentsCount || 0}
        />
        <StatCard
          icon={AlertTriangle}
          iconClass="bg-rose-50 text-rose-500"
          label="Past davomatlilar"
          value={data.lowAttendanceStudents?.length || 0}
          valueClass="text-rose-500"
          hint={`${data.threshold}% dan past`}
        />
        <StatCard
          icon={CalendarDays}
          iconClass="bg-slate-100 text-slate-500"
          label="Jami darslar"
          value={data.aggregate?.totalClasses || 0}
        />
        <StatCard
          icon={CalendarX}
          iconClass="bg-amber-50 text-amber-500"
          label="Belgilanmagan"
          value={data.aggregate?.unmarked || 0}
          valueClass="text-amber-600"
          hint="o'qituvchi belgilamagan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LowAttendanceList
          items={data.lowAttendanceStudents || []}
          threshold={data.threshold}
        />
        <TopAbsentList items={data.topAbsent || []} />
      </div>

      <GroupBreakdownTable
        items={data.groupBreakdown || []}
        meta={data.groupBreakdownMeta}
        page={groupPage}
        onPageChange={setGroupPage}
      />
    </div>
  );
};

export default AttendanceOverallPanel;
