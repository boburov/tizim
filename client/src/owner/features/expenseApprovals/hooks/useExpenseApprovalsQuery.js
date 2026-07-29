import { useQuery } from "@tanstack/react-query";
import { expenseApprovalsAPI } from "../api/expenseApprovals.api";
import { qk } from "@/shared/lib/query/keys";
import { POLL_MS } from "../constants";

/**
 * Tasdiqlar ro'yxati.
 *
 * TO'LIQ javobni qaytaradi (`{ data, meta }`) - `meta` sahifalash uchun
 * KERAK. Ilgari chaqiruvchi faqat massivni olib, `meta` ni tashlab
 * yuborardi: natijada sahifa jimgina birinchi 20 ta yozuvni ko'rsatib,
 * qolganini butunlay yashirardi.
 */
const useExpenseApprovalsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.expenseApprovals.list(params),
    queryFn: () => expenseApprovalsAPI.list(params).then((r) => r.data),
    // Yangi so'rov kelganda ro'yxat o'zi yangilanadi - badge va
    // bildirishnoma oqimi bilan bir xil ritm.
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    // Sahifa/filtr almashganda jadval bo'shab ketmasligi uchun.
    placeholderData: (prev) => prev,
    ...options,
  });

export default useExpenseApprovalsQuery;
