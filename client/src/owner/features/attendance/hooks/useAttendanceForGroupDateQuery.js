import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useAttendanceForGroupDateQuery = (groupId, date, slot) =>
  useQuery({
    queryKey: qk.attendance.byGroupDate(groupId, date, slot || ""),
    queryFn: () =>
      attendanceAPI
        .listForGroupDate(groupId, date, slot)
        .then((r) => r.data.data),
    enabled: !!groupId && !!date,
  });

export default useAttendanceForGroupDateQuery;
