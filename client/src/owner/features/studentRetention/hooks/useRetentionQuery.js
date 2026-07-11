import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { retentionAPI } from "../api/retention.api";

const useRetentionQuery = (params) =>
  useQuery({
    queryKey: qk.adminDashboard.retention(params),
    queryFn: () => retentionAPI.get(params).then((r) => r.data.data),
  });

export default useRetentionQuery;
