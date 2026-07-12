// TanStack Query
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiErrorToast } from "@/shared/utils/apiError";

// Sonner
import { toast } from "sonner";

// API
import { groupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

const useGroupRemoveStudentMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, studentId, reasonId, writeOff }) =>
      groupsAPI
        .removeStudent(id, studentId, { reasonId, writeOff })
        .then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.groups.all() });
      qc.invalidateQueries({ queryKey: qk.groups.one(vars.id) });
      if (vars.studentId) {
        qc.invalidateQueries({ queryKey: qk.users.one(vars.studentId) });
      }
      // Davomat ro'yxati (roster) ham yangilanadi - chiqarilgan o'quvchi
      // "Davomat belgilash"da qolib ketmasligi uchun.
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      // Yomon qarz hisobga olinsin - moliya hisobotlari yangilanadi.
      qc.invalidateQueries({ queryKey: qk.financeReport.all() });
      toast.success(data?.message || "O'quvchi guruhdan chiqarildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      // Qarz aniqlanganda (OUTSTANDING_DEBT) toast KO'RSATILMAYDI - komponent
      // "Yomon qarz" tasdiq modalini ochadi. Boshqa xatolarda odatiy toast.
      if (err?.response?.data?.code !== "OUTSTANDING_DEBT") {
        apiErrorToast(err);
      }
      options.onError?.(err);
    },
  });
};

export default useGroupRemoveStudentMutation;
