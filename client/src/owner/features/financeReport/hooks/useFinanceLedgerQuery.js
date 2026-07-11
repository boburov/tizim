import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeReportAPI } from "../api/financeReport.api";

const useFinanceLedgerQuery = (params) =>
  useQuery({
    queryKey: qk.financeReport.ledger(params),
    queryFn: () => financeReportAPI.ledger(params).then((r) => r.data.data),
  });

export default useFinanceLedgerQuery;
