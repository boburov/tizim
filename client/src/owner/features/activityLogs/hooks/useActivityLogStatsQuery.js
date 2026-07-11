import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

const useActivityLogStatsQuery = (params) =>
  useQuery({
    queryKey: qk.activityLogs.stats(params),
    queryFn: () => activityLogsAPI.stats(params).then((r) => r.data.data),
  });

export default useActivityLogStatsQuery;
