import { useQuery } from "@tanstack/react-query";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";

const useDashboardQuery = (params) =>
  useQuery({
    queryKey: qk.attendance.dashboard(params),
    queryFn: () => attendanceAPI.dashboard(params).then((r) => r.data.data),
    enabled: !!params?.fromDate && !!params?.toDate,
    placeholderData: (prev) => prev,
  });

export default useDashboardQuery;
