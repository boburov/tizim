import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeReportAPI } from "../api/financeReport.api";

// Yomon qarzlar (hisobdan chiqarilgan) ro'yxati - tanlangan davr/guruh bo'yicha.
const useFinanceWriteOffsQuery = (params) =>
  useQuery({
    queryKey: qk.financeReport.writeOffs(params),
    queryFn: () => financeReportAPI.writeOffs(params).then((r) => r.data.data),
  });

export default useFinanceWriteOffsQuery;
