import { useQuery } from "@tanstack/react-query";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";

const useExpenseApprovalsQuery = (params) =>
  useQuery({
    queryKey: qk.expenseApprovals.list(params),
    queryFn: () => expenseApprovalsAPI.list(params).then((r) => r.data),
  });

export default useExpenseApprovalsQuery;
