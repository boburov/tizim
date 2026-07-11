// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Sonner
import { toast } from "sonner";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupPermanentRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName } = {}) =>
      groupsAPI.permanentRemove(id, { confirmName }).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      // Faqat ro'yxat querylarini yangilaymiz. O'chirilgan guruhning detail
      // querylariga (one/history/teacherPeriods) atayin tegmaymiz - aks holda ular
      // yo'q guruh uchun qayta yuklanib 404 toast berardi. Sahifa ro'yxatga yo'naltiriladi.
      qc.invalidateQueries({ queryKey: qk.groups.lists() });
      toast.success("Guruh butunlay o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useGroupPermanentRemoveMutation;
