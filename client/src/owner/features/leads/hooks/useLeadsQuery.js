import { useQuery } from "@tanstack/react-query";
import { leadsAPI } from "../api/leads.api";
import { qk } from "@/shared/lib/query/keys";

const useLeadsQuery = (params) =>
  useQuery({
    queryKey: qk.leads.list(params),
    queryFn: () => leadsAPI.list(params).then((r) => r.data),
  });

export default useLeadsQuery;
