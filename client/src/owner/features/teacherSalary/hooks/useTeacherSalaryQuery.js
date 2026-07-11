import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

const useTeacherSalaryQuery = (id, options = {}) =>
  useQuery({
    queryKey: qk.teacherSalary.salary(id),
    queryFn: () => teacherSalaryAPI.salary(id).then((r) => r.data.data),
    enabled: !!id,
    ...options,
  });

export default useTeacherSalaryQuery;
