import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentYearAttendanceQuery = (studentId, { year } = {}) =>
  useQuery({
    queryKey: qk.attendance.studentYearly(studentId, { year }),
    queryFn: () =>
      attendanceAPI.studentYearly(studentId, { year }).then((r) => r.data.data),
    enabled: !!studentId && !!year,
  });

export default useStudentYearAttendanceQuery;
