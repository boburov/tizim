// TanStack Query
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// API
import { qk } from "@/shared/lib/query/keys";
import { assignmentsAPI } from "@/owner/features/assignments";

/** O'quvchiga kelgan vazifalar (platforma ichida). */
export const useMyAssignmentsQuery = (params, options = {}) =>
  useQuery({
    queryKey: qk.assignments.my(params),
    queryFn: () => assignmentsAPI.my(params).then((r) => r.data),
    ...options,
  });

/**
 * O'qilmagan vazifalar soni (sidebar nishoni).
 *
 * PLATFORMA kanali BOTDAN mustaqil: botni bloklagan o'quvchi vazifani
 * faqat shu yerda ko'radi, shuning uchun nishon uni ilovaga qaytaradi.
 * 60 soniyalik yangilanish yetarli - vazifa har soniyada kelmaydi.
 */
export const useMyAssignmentsUnreadCountQuery = (options = {}) =>
  useQuery({
    queryKey: qk.assignments.myUnreadCount(),
    queryFn: () => assignmentsAPI.myUnreadCount().then((r) => r.data.data?.count ?? 0),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    ...options,
  });

/**
 * Vazifa ochilganda "o'qildi" deb belgilash.
 *
 * Bu botdan MUSTAQIL: botni bloklagan o'quvchi vazifani faqat shu yerda
 * ko'radi va o'qituvchi uning ochganini bilishi kerak.
 */
export const useMarkAssignmentReadMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recipientId) =>
      assignmentsAPI.markRead(recipientId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.assignments.all() });
    },
  });
};

export default useMyAssignmentsQuery;
