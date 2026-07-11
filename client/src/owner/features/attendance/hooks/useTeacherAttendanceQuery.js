import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useTeacherAttendanceQuery = (groupId, date) =>
  useQuery({
    queryKey: qk.attendance.teacher(groupId, date),
    queryFn: () =>
      attendanceAPI.teacherStatus(groupId, date).then((r) => r.data.data),
    enabled: !!groupId && !!date,
  });

export default useTeacherAttendanceQuery;
