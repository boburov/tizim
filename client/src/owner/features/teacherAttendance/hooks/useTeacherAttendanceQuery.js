import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherAttendanceAPI } from "../api/teacherAttendance.api";

const useTeacherAttendanceQuery = (date) =>
  useQuery({
    queryKey: qk.teacherAttendance.byDate(date),
    queryFn: () =>
      teacherAttendanceAPI.listForDate(date).then((r) => r.data.data),
    enabled: !!date,
  });

export default useTeacherAttendanceQuery;
