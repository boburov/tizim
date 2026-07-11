import { useQuery } from "@tanstack/react-query";
import { gradesAPI } from "../api/grades.api";
import { qk } from "@/shared/lib/query/keys";

const useStudentGradeSummaryQuery = (studentId, params = {}) =>
  useQuery({
    queryKey: qk.grades.studentSummary(studentId, params),
    queryFn: () =>
      gradesAPI.studentSummary(studentId, params).then((r) => r.data.data),
    enabled: !!studentId,
  });

export default useStudentGradeSummaryQuery;
