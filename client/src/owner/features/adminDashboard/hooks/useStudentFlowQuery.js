import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { adminDashboardAPI } from "../api/adminDashboard.api";

const useStudentFlowQuery = (params) =>
  useQuery({
    queryKey: qk.adminDashboard.studentFlow(params),
    queryFn: () => adminDashboardAPI.studentFlow(params).then((r) => r.data.data),
  });

export default useStudentFlowQuery;
