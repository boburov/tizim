import { useState } from "react";

import ErrorState from "@/shared/components/ui/feedback/ErrorState";

import StudentStatCards from "../components/StudentStatCards";
import EnrollmentTrendChart from "../components/EnrollmentTrendChart";
import DurationCohortBars from "../components/DurationCohortBars";
import RecentEnrollmentsList from "../components/RecentEnrollmentsList";

import useStudentStatsQuery from "../hooks/useStudentStatsQuery";

const EMPTY_STATS = { cohorts: [], avgDurationMonths: 0, total: 0 };

const StudentStatsPage = () => {
  // Muddat taqsimoti rejimi: hozir o'qiyotganlar yoki yakunlaganlar.
  const [mode, setMode] = useState("ongoing");

  const { data, isLoading, isError, refetch } = useStudentStatsQuery({
    months: 12,
    recentLimit: 8,
  });

  const stats =
    (mode === "finished" ? data?.finished : data?.ongoing) || EMPTY_STATS;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">O'quvchilar statistikasi</h1>
      </header>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Yuklanmoqda...
        </div>
      ) : (
        <>
          <StudentStatCards data={data} stats={stats} mode={mode} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <EnrollmentTrendChart items={data?.enrollmentTrend || []} />
            </div>
            <DurationCohortBars
              cohorts={stats.cohorts || []}
              mode={mode}
              onModeChange={setMode}
            />
          </div>

          <RecentEnrollmentsList items={data?.recentEnrollments || []} />
        </>
      )}
    </div>
  );
};

export default StudentStatsPage;
