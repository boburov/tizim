import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeReportAPI } from "../api/financeReport.api";

const useFinanceGroupBreakdownQuery = (params) =>
  useQuery({
    queryKey: qk.financeReport.groupBreakdown(params),
    queryFn: () =>
      financeReportAPI.groupBreakdown(params).then((r) => r.data.data),
  });

export default useFinanceGroupBreakdownQuery;
