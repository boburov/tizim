import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

const useActivityLogDetailQuery = (id) =>
  useQuery({
    queryKey: qk.activityLogs.one(id),
    queryFn: () => activityLogsAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
  });

export default useActivityLogDetailQuery;
