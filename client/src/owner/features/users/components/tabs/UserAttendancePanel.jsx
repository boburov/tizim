import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";
import { AttendanceYearHeatmap } from "@/shared/components/attendance";
import useStudentYearAttendanceQuery from "@/owner/features/attendance/hooks/useStudentYearAttendanceQuery";

const AttendanceSummaryCard = ({ summary }) => {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <p className="text-xs text-muted-foreground">Jami darslar</p>
        <p className="text-xl font-semibold">{summary.totalClasses}</p>
      </Card>
      <Card>
        <p className="text-xs text-muted-foreground">Keldi</p>
        <p className="text-xl font-semibold text-green-600">{summary.present}</p>
      </Card>
      <Card>
        <p className="text-xs text-muted-foreground">Kelmadi</p>
        <p className="text-xl font-semibold text-red-600">{summary.absent}</p>
      </Card>
      <Card>
        <p className="text-xs text-muted-foreground">Sababli</p>
        <p className="text-xl font-semibold text-amber-600">{summary.excused}</p>
      </Card>
    </div>
  );
};

const UserAttendancePanel = () => {
  const { profile } = useOutletContext();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { data, isLoading } = useStudentYearAttendanceQuery(profile._id, { year });

  return (
    <div className="space-y-4 pt-3">
      <AttendanceSummaryCard summary={profile.attendanceSummary} />
      <Card>
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Yuklanmoqda...</div>
        ) : (
          <AttendanceYearHeatmap
            data={data}
            year={year}
            onPrevYear={() => setYear((y) => y - 1)}
            onNextYear={() => setYear((y) => y + 1)}
          />
        )}
      </Card>
    </div>
  );
};

export default UserAttendancePanel;
