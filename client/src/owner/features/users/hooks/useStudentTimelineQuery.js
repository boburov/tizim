// TanStack Query
import { useQuery, keepPreviousData } from "@tanstack/react-query";

// API + keys
import { studentTimelineAPI } from "../api/studentTimeline.api";
import { qk } from "@/shared/lib/query/keys";

// O'quvchining faoliyat tarixi (Arxiv tab). Sahifalanadi.
const useStudentTimelineQuery = (studentId, params = {}) =>
  useQuery({
    queryKey: qk.activityHistory.student(studentId, params),
    queryFn: () =>
      studentTimelineAPI.list(studentId, params).then((r) => r.data),
    enabled: !!studentId,
    placeholderData: keepPreviousData,
  });

export default useStudentTimelineQuery;
