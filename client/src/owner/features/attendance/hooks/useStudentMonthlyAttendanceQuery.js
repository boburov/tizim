import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentMonthlyAttendanceQuery = (studentId, { year, month } = {}) =>
  useQuery({
    queryKey: qk.attendance.studentMonthly(studentId, { year, month }),
    queryFn: () =>
      attendanceAPI
        .studentMonthly(studentId, { year, month })
        .then((r) => r.data.data),
    enabled: !!studentId && !!year && !!month,
  });

export default useStudentMonthlyAttendanceQuery;
