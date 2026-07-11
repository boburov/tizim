import { useQuery } from "@tanstack/react-query";
import { leadOptionsAPI } from "../api/leadOptions.api";
import { qk } from "@/shared/lib/query/keys";

// kind: "source" | "direction" | "rejection"
const useLeadOptionsQuery = (params) =>
  useQuery({
    queryKey: qk.leadOptions.list(params),
    queryFn: () => leadOptionsAPI.list(params).then((r) => r.data),
    enabled: !!params?.kind,
  });

export default useLeadOptionsQuery;
