import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { adminDashboardAPI } from "../api/adminDashboard.api";

const useCashflowQuery = (params) =>
  useQuery({
    queryKey: qk.adminDashboard.cashflow(params),
    queryFn: () => adminDashboardAPI.cashflow(params).then((r) => r.data.data),
  });

export default useCashflowQuery;
