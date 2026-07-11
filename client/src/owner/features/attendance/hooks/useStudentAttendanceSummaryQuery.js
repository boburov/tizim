import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentAttendanceSummaryQuery = (studentId, range) =>
  useQuery({
    queryKey: qk.attendance.studentSummary(studentId, range),
    queryFn: () =>
      attendanceAPI
        .studentSummary(studentId, range)
        .then((r) => r.data.data),
    enabled: !!studentId && !!range?.fromDate && !!range?.toDate,
  });

export default useStudentAttendanceSummaryQuery;
