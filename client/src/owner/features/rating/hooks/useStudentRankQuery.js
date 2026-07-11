import { useQuery } from "@tanstack/react-query";
import { ratingAPI } from "../api/rating.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentRankQuery = (studentId, params = {}) =>
  useQuery({
    queryKey: qk.rating.studentRank(studentId, params),
    queryFn: () =>
      ratingAPI.studentRank(studentId, params).then((r) => r.data.data),
    enabled: !!studentId,
  });

export default useStudentRankQuery;
