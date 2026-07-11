import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useGroupMonthlyAttendanceQuery = (groupId, { year, month } = {}) =>
  useQuery({
    queryKey: qk.attendance.groupMonthly(groupId, { year, month }),
    queryFn: () =>
      attendanceAPI
        .groupMonthly(groupId, { year, month })
        .then((r) => r.data.data),
    enabled: !!groupId && !!year && !!month,
  });

export default useGroupMonthlyAttendanceQuery;
