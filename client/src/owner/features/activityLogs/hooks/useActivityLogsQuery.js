import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { activityLogsAPI } from "../api/activityLogs.api";

// ⚠ `options` — sahifadagi tab'lar uchun `enabled` kerak: faol
// bo'lmagan tab so'rov yubormasligi shart, aks holda sahifa ochilishida
// uchala endpoint ham chaqirilardi.
const useActivityLogsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.activityLogs.list(params),
    queryFn: () => activityLogsAPI.list(params).then((r) => r.data),
    ...options,
  });

export default useActivityLogsQuery;
