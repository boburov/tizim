import { useMemo, useState } from "react";
import Card from "@/shared/components/ui/card/Card";
import { MonthlyAttendanceCalendar } from "@/shared/components/attendance";
import useStudentMonthlyAttendanceQuery from "@/owner/features/attendance/hooks/useStudentMonthlyAttendanceQuery";
import useStudentAttendanceSummaryQuery from "@/owner/features/attendance/hooks/useStudentAttendanceSummaryQuery";
import useMeQuery from "@/features/auth/hooks/useMeQuery";
import { formatSchedule } from "@/shared/utils/formatSchedule";
import { toDateInput } from "@/shared/utils/formatDate";

const MyAttendancePage = () => {
  const { data: me } = useMeQuery();
  const profile = me?.profile;
  const studentId = profile?._id;

  const now = new Date();
  const [period, setPeriod] = useState({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const { data, isLoading } = useStudentMonthlyAttendanceQuery(
    studentId,
    period,
  );

  // Kartochkalar TANLANGAN oy bo'yicha (kalendar bilan mos bo'lishi uchun) -
  // /me dagi statik joriy-oy summary'si emas.
  const range = useMemo(
    () => ({
      fromDate: toDateInput(new Date(period.year, period.month - 1, 1)),
      toDate: toDateInput(new Date(period.year, period.month, 0)),
    }),
    [period],
  );
  const { data: summary } = useStudentAttendanceSummaryQuery(studentId, range);

  const goPrev = () =>
    setPeriod((p) => {
      const m = p.month - 1;
      if (m < 1) return { year: p.year - 1, month: 12 };
      return { year: p.year, month: m };
    });
  const goNext = () =>
    setPeriod((p) => {
      const m = p.month + 1;
      if (m > 12) return { year: p.year + 1, month: 1 };
      return { year: p.year, month: m };
    });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Davomatim</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <p className="text-sm text-muted-foreground">Davomat foizi</p>
          <p className="text-2xl font-semibold text-blue-600">
            {summary?.attendanceRate !== null && summary?.attendanceRate !== undefined
              ? `${summary.attendanceRate}%`
              : "-"}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Jami darslar</p>
          <p className="text-2xl font-semibold">{summary?.totalClasses || 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Keldi</p>
          <p className="text-2xl font-semibold text-green-600">
            {summary?.present || 0}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Kelmadi</p>
          <p className="text-2xl font-semibold text-red-600">
            {summary?.absent || 0}
          </p>
        </Card>
      </div>

      <Card>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : (
          <MonthlyAttendanceCalendar
            data={data}
            year={period.year}
            month={period.month}
            onPrevMonth={goPrev}
            onNextMonth={goNext}
          />
        )}
      </Card>

      {data?.groups && data.groups.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Guruhlarim</h3>
          <div className="space-y-2">
            {data.groups.map((g) => (
              <div
                key={g.group._id}
                className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 text-sm"
              >
                <span className="font-medium">{g.group.name}</span>
                <span className="text-muted-foreground">
                  {formatSchedule(g.group.schedule)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default MyAttendancePage;
