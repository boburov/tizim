import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

const useTeacherSalariesQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.teacherSalary.salaries(params),
    queryFn: () => teacherSalaryAPI.salaries(params).then((r) => r.data),
    ...options,
  });

export default useTeacherSalariesQuery;
