import { useQuery } from "@tanstack/react-query";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";

// Tanlangan auditoriya bo'yicha jonli recipient hisobini qaytaradi.
// `enabled` - auditoriya to'liq tanlanganda (kerakli id'lar bor) yoqiladi.
const useAudiencePreviewQuery = (audience, enabled = true) =>
  useQuery({
    queryKey: qk.notifications.preview(audience),
    queryFn: () =>
      notificationsAPI
        .preview({ audience })
        .then((r) => r.data.data?.count ?? 0),
    enabled,
    // Hisob qisqa muddatli - qayta tanlovda darhol yangilansin
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export default useAudiencePreviewQuery;
