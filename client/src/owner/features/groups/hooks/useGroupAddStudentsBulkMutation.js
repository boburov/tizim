// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Sonner
import { toast } from "sonner";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Bir nechta o'quvchini bir martada guruhga qo'shish. Dars to'qnashuvi bo'lsa
// backend { requiresConfirmation:true, conflicts } qaytaradi - bu holatda hech
// narsa qo'shilmaydi va toast chiqmaydi (komponent tasdiq modalini ko'rsatadi).
const useGroupAddStudentsBulkMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, studentIds, joinedAt, leftAt, force }) =>
      groupsAPI
        .addStudentsBulk(id, { studentIds, joinedAt, leftAt, force })
        .then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      // Tasdiq kerak - hali qo'shilmadi, keshni yangilamaymiz.
      if (data?.requiresConfirmation) {
        options.onSuccess?.(data, vars, ctx);
        return;
      }

      qc.invalidateQueries({ queryKey: qk.groups.all() });
      qc.invalidateQueries({ queryKey: qk.groups.one(vars.id) });
      // Davomat ro'yxati (roster) ham yangilanishi kerak - aks holda yangi
      // qo'shilgan o'quvchi eski (stale) cache tufayli ko'rinmay qoladi.
      qc.invalidateQueries({ queryKey: qk.attendance.all() });

      const addedCount = data?.added?.length || 0;
      const failedCount = data?.failed?.length || 0;
      if (addedCount) {
        toast.success(
          failedCount
            ? `${addedCount} ta o'quvchi qo'shildi, ${failedCount} tasi qo'shilmadi`
            : `${addedCount} ta o'quvchi qo'shildi`,
        );
      } else if (failedCount) {
        toast.error("O'quvchilar qo'shilmadi");
      }

      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useGroupAddStudentsBulkMutation;
