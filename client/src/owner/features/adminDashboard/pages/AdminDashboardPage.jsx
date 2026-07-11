import useObjectState from "@/shared/hooks/useObjectState";

import DashboardTopbar from "../components/DashboardTopbar";
import DashboardStatCards from "../components/DashboardStatCards";
import CashflowChart from "../components/CashflowChart";
import AttendanceGauge from "../components/AttendanceGauge";
import RecentPaymentsList from "../components/RecentPaymentsList";
import TopTeachersList from "../components/TopTeachersList";
import MonthlySummaryCard from "../components/MonthlySummaryCard";
import StudentFlowCard from "../components/StudentFlowCard";

import useOverviewQuery from "../hooks/useOverviewQuery";
import useStudentFlowQuery from "../hooks/useStudentFlowQuery";

const SkeletonBlock = ({ className = "" }) => (
  <div className={`animate-pulse rounded-2xl bg-zinc-100 ${className}`} />
);

const AdminDashboardPage = () => {
  const now = new Date();
  const period = useObjectState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const periodParams = { year: period.year, month: period.month };

  const { data: overview, isLoading } = useOverviewQuery(periodParams);
  const { data: studentFlow } = useStudentFlowQuery({ months: 6 });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">
          Boshqaruv paneli
        </h1>
        <DashboardTopbar />
      </header>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-36" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SkeletonBlock className="h-64 lg:col-span-2" />
            <SkeletonBlock className="h-64" />
          </div>
        </div>
      ) : (
        <>
          <DashboardStatCards data={overview} />

          {/* Asosiy qator: chap (chart) + o'ng (so'nggi to'lovlar) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CashflowChart />
            </div>
            <RecentPaymentsList items={overview?.recentPayments || []} />
          </div>

          {/* Pastki qator: davomat gauge + o'qituvchilar + oylik xulosa */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AttendanceGauge gauge={overview?.attendanceGauge} />
            <TopTeachersList items={overview?.topTeachers || []} />
            <MonthlySummaryCard data={overview} />
          </div>

          {/* O'quvchilar oqimi (kengaytirilgan) */}
          <StudentFlowCard items={studentFlow || []} />
        </>
      )}
    </div>
  );
};

export default AdminDashboardPage;
