import { useState } from "react";
import { useParams } from "react-router-dom";
import Card from "@/shared/components/ui/card/Card";
import { AttendanceYearHeatmap } from "@/shared/components/attendance";
import useStudentYearAttendanceQuery from "@/owner/features/attendance/hooks/useStudentYearAttendanceQuery";

const MyStudentAttendancePanel = () => {
  const { studentId } = useParams();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const { data, isLoading } = useStudentYearAttendanceQuery(studentId, { year });

  return (
    <Card className="mt-3">
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
  );
};

export default MyStudentAttendancePanel;
