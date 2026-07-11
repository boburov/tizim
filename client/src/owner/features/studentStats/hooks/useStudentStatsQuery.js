import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { studentStatsAPI } from "../api/studentStats.api";

const useStudentStatsQuery = (params) =>
  useQuery({
    queryKey: qk.adminDashboard.studentStats(params),
    queryFn: () => studentStatsAPI.get(params).then((r) => r.data.data),
  });

export default useStudentStatsQuery;
