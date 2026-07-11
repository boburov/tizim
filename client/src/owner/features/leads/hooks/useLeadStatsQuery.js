import { useQuery } from "@tanstack/react-query";
import { leadsAPI } from "../api/leads.api";
import { qk } from "@/shared/lib/query/keys";

const useLeadStatsQuery = (params) =>
  useQuery({
    queryKey: qk.leads.stats(params),
    queryFn: () => leadsAPI.stats(params).then((r) => r.data.data),
  });

export default useLeadStatsQuery;
