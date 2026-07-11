import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

const useActivityLogsQuery = (params) =>
  useQuery({
    queryKey: qk.activityLogs.list(params),
    queryFn: () => activityLogsAPI.list(params).then((r) => r.data),
  });

export default useActivityLogsQuery;
