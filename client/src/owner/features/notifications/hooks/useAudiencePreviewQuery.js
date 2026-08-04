import { useQuery } from "@tanstack/react-query";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";

/**
 * Tanlangan auditoriya bo'yicha jonli hisob VA yetkazish taqsimoti.
 *
 * Qaytadi: { count, total, deliverable, blocked, noBot, blockedStudents[],
 *            noBotStudents[] }
 *
 * Ilgari faqat `count` qaytardi. Raqamning o'zi yetarli emas edi: xodim
 * "30 kishiga boradi" deb yuborardi, lekin botni bloklaganlarga xabar
 * UMUMAN yetmasdi va buni faqat keyin, oluvchilar jadvalidan bilib olardi.
 *
 * `enabled` - auditoriya to'liq tanlanganda (kerakli id'lar bor) yoqiladi.
 */
const useAudiencePreviewQuery = (audience, enabled = true) =>
  useQuery({
    queryKey: qk.notifications.preview(audience),
    queryFn: () =>
      notificationsAPI.preview({ audience }).then((r) => r.data.data || null),
    enabled,
    // Hisob qisqa muddatli - qayta tanlovda darhol yangilansin
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

export default useAudiencePreviewQuery;
