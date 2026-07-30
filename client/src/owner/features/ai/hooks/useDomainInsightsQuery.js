import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

// Modul paneli uchun: "Moliya → AI Insights".
//
// `enabled` - domen berilmasa so'rov yuborilmaydi. Panel shartli
// ko'rsatiladigan sahifalarda hook baribir chaqiriladi (React qoidasi),
// shuning uchun so'rovni hook ichida to'xtatish kerak.
export const useDomainInsightsQuery = (domain, params, options = {}) =>
  useQuery({
    queryKey: qk.ai.byDomain(domain, params),
    queryFn: () => aiAPI.byDomain(domain, params).then((r) => r.data.data),
    enabled: Boolean(domain) && options.enabled !== false,
    staleTime: 5 * 60 * 1000,
  });

export default useDomainInsightsQuery;
