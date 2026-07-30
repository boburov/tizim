import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

// HISOBOTLAR - o'tmish snapshot'lari.
//
// staleTime uzun (30 daqiqa): hisobot bir marta tuziladi va O'ZGARMAYDI
// (aynan shuning uchun u DB da saqlanadi - modeldagi izohga qarang).
// Uni tez-tez qayta so'rash mutlaqo befoyda.
const HALF_HOUR = 30 * 60 * 1000;

export const useReportsQuery = (params) =>
  useQuery({
    queryKey: qk.ai.reportList(params),
    queryFn: () => aiAPI.reports(params).then((r) => r.data),
    staleTime: HALF_HOUR,
  });

export const useReportQuery = (id) =>
  useQuery({
    queryKey: qk.ai.report(id),
    queryFn: () => aiAPI.report(id).then((r) => r.data.data),
    enabled: Boolean(id),
    staleTime: HALF_HOUR,
  });

export const useLatestReportQuery = (period = "daily") =>
  useQuery({
    queryKey: qk.ai.latestReport(period),
    queryFn: () => aiAPI.latestReport(period).then((r) => r.data.data),
    staleTime: HALF_HOUR,
  });

export default useReportsQuery;
