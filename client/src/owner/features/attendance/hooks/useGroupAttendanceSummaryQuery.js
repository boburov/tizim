import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useGroupAttendanceSummaryQuery = (groupId, range) =>
  useQuery({
    queryKey: qk.attendance.groupSummary(groupId, range),
    queryFn: () =>
      attendanceAPI.groupSummary(groupId, range).then((r) => r.data.data),
    enabled: !!groupId && !!range?.fromDate && !!range?.toDate,
  });

export default useGroupAttendanceSummaryQuery;
