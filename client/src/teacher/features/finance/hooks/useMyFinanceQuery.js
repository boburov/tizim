// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { teacherFinanceAPI } from "../api/finance.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useMyFinanceQuery = () =>
  useQuery({
    queryKey: qk.teacherSalary.myFinance(),
    queryFn: () => teacherFinanceAPI.myFinance().then((r) => r.data.data),
  });

export default useMyFinanceQuery;
