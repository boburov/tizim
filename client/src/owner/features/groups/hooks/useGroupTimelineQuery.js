// TanStack Query
import { useQuery, keepPreviousData } from "@tanstack/react-query";

// API + keys
import { groupTimelineAPI } from "../api/groupTimeline.api";
import { qk } from "@/shared/lib/query/keys";

// Guruhning faoliyat tarixi (Arxiv tab). Sahifalanadi.
const useGroupTimelineQuery = (groupId, params = {}) =>
  useQuery({
    queryKey: qk.activityHistory.group(groupId, params),
    queryFn: () => groupTimelineAPI.list(groupId, params).then((r) => r.data),
    enabled: !!groupId,
    placeholderData: keepPreviousData,
  });

export default useGroupTimelineQuery;
