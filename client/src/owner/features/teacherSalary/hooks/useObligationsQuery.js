import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { teacherSalaryAPI } from "../api/teacherSalary.api";

const useObligationsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.teacherSalary.obligations(params),
    queryFn: () => teacherSalaryAPI.obligations(params).then((r) => r.data.data),
    enabled: !!params?.year,
    ...options,
  });

export default useObligationsQuery;
