// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";

// API
import { studentGroupAPI } from "../api/group.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// "Siz guruhdan chiqarildingiz" modalini yopganda xabarni ko'rilgan deb belgilaydi.
// auth/me qayta yuklanadi - shunda profile.removalNotice tozalanadi va modal
// qayta ochilmaydi.
const useRemovalNoticeSeenMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => studentGroupAPI.markRemovalNoticeSeen().then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.auth.me() });
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => options.onError?.(err),
  });
};

export default useRemovalNoticeSeenMutation;
