import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeReportAPI } from "../api/financeReport.api";

const useFinanceSummaryQuery = (params) =>
  useQuery({
    queryKey: qk.financeReport.summary(params),
    queryFn: () => financeReportAPI.summary(params).then((r) => r.data.data),
  });

export default useFinanceSummaryQuery;
