import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { adminDashboardAPI } from "../api/adminDashboard.api";

const useOverviewQuery = (params) =>
  useQuery({
    queryKey: qk.adminDashboard.overview(params),
    queryFn: () => adminDashboardAPI.overview(params).then((r) => r.data.data),
  });

export default useOverviewQuery;
