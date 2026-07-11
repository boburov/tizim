import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { financeAPI } from "../api/finance.api";

const useDiscountsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.finance.discounts(params),
    queryFn: () => financeAPI.discounts(params).then((r) => r.data),
    ...options,
  });

export default useDiscountsQuery;
