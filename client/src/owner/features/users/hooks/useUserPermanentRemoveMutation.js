// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Sonner
import { toast } from "sonner";

// API
import { usersAPI } from "../api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useUserPermanentRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName } = {}) =>
      usersAPI.permanentRemove(id, { confirmName }).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      // Faqat ro'yxat querylarini yangilaymiz. O'chirilgan foydalanuvchining
      // detail querylariga (one/password/group-history) atayin tegmaymiz - aks
      // holda ular yo'q foydalanuvchi uchun qayta yuklanib 404 ("Foydalanuvchi
      // topilmadi") toast beradi. Sahifa baribir ro'yxatga yo'naltiriladi.
      qc.invalidateQueries({ queryKey: qk.users.lists() });
      toast.success("Butunlay o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useUserPermanentRemoveMutation;
