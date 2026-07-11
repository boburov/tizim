import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

/**
 * Oylik matritsada bitta katakni inline belgilash.
 * Optimistik: avval cache'da statusni o'zgartiramiz, xato bo'lsa ortga qaytaramiz.
 */
const useMatrixCellMutation = (groupId, { year, month }) => {
  const qc = useQueryClient();
  const key = qk.attendance.groupMonthly(groupId, { year, month });

  return useMutation({
    mutationFn: ({ studentId, dateKey, slot, status }) =>
      attendanceAPI
        .bulkRecord(groupId, {
          date: dateKey,
          slot: slot || "",
          items: [{ studentId, status }],
        })
        .then((r) => r.data),

    onMutate: async ({ studentId, colKey, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, (old) => {
        if (!old?.students) return old;
        return {
          ...old,
          students: old.students.map((row) => {
            if (row.student._id !== studentId) return row;
            const cells = { ...(row.cells || {}) };
            cells[colKey] = { ...(cells[colKey] || {}), status };
            return { ...row, cells };
          }),
        };
      });
      return { prev };
    },

    onError: (err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      apiErrorToast(err);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
    },
  });
};

export default useMatrixCellMutation;
