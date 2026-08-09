import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { leadsAPI } from "../api/leads.api";

/**
 * Lidga biriktiriladigan xodimlar (tanlagichlar uchun).
 *
 * NEGA `useUsersListQuery` EMAS: u `/api/users` ga boradi va o'sha
 * manzil `users.read` ruxsatini talab qiladi. Resepshin rolida bu
 * ruxsat yo'q, natijada lidlar sahifasi ochilishi bilan "Ruxsat
 * etilmagan" xatosi chiqardi - garchi odamning lidlarga to'liq
 * huquqi bo'lsa ham. Bu manzil esa `leads.read` bilan ishlaydi va
 * faqat ism + rol qaytaradi.
 *
 * Ro'yxat kam o'zgaradi (xodim kamdan-kam qo'shiladi), shuning uchun
 * uzoq kesh: har modal ochilganda qayta so'ralmaydi.
 */
const HOUR = 60 * 60 * 1000;

const useLeadAssigneesQuery = (options = {}) =>
  useQuery({
    queryKey: qk.leads.assignees(),
    queryFn: () => leadsAPI.assignees().then((r) => r.data.data),
    staleTime: HOUR,
    ...options,
  });

export default useLeadAssigneesQuery;
