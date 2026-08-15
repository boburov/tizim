import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { branchesAPI } from "../api/branches.api";

/**
 * Delegatsiya katalogi: qaysi sozlama turi delegatsiya qilinadi, unga
 * qaysi rejimlar mumkin va qanday chegara qo'llanadi.
 *
 * Statik metama'lumot - o'zgarmaydi, shuning uchun uzoq keshlanadi.
 * Qayta so'rash faqat ortiqcha trafik bo'lardi.
 */
const useDelegationOptionsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.branches.delegationOptions(),
    queryFn: () => branchesAPI.delegationOptions().then((r) => r.data.data),
    staleTime: Infinity,
    ...options,
  });

export default useDelegationOptionsQuery;
