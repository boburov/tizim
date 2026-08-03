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
