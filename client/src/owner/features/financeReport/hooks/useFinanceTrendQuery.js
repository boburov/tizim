import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeReportAPI } from "../api/financeReport.api";

const useFinanceTrendQuery = (params) =>
  useQuery({
    queryKey: qk.financeReport.trend(params),
    queryFn: () => financeReportAPI.trend(params).then((r) => r.data.data),
  });

export default useFinanceTrendQuery;
