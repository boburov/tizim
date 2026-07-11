// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Sonner
import { toast } from "sonner";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupAddStudentMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, studentId, joinedAt, leftAt }) =>
      groupsAPI.addStudent(id, studentId, joinedAt, leftAt).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.groups.all() });
      qc.invalidateQueries({ queryKey: qk.groups.one(vars.id) });
      // Davomat ro'yxati (roster) ham yangilanishi kerak - aks holda yangi
      // qo'shilgan o'quvchi "Davomat belgilash"da eski (stale) cache tufayli
      // ko'rinmay qoladi.
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("O'quvchi qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useGroupAddStudentMutation;
