import { useQuery } from "@tanstack/react-query";
import { gradesAPI } from "../api/grades.api";
import { qk } from "@/shared/lib/query/keys";

const useGroupGradeSummaryQuery = (groupId, params) =>
  useQuery({
    queryKey: qk.grades.groupSummary(groupId, params),
    queryFn: () => gradesAPI.groupSummary(groupId, params).then((r) => r.data.data),
    enabled: !!groupId && !!params?.fromDate && !!params?.toDate,
  });

export default useGroupGradeSummaryQuery;
