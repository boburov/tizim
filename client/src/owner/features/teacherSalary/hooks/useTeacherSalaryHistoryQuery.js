import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

const useTeacherSalaryHistoryQuery = (teacherId, options = {}) =>
  useQuery({
    queryKey: qk.teacherSalary.teacherHistory(teacherId),
    queryFn: () =>
      teacherSalaryAPI.salaryHistory(teacherId).then((r) => r.data.data),
    enabled: !!teacherId,
    ...options,
  });

export default useTeacherSalaryHistoryQuery;
