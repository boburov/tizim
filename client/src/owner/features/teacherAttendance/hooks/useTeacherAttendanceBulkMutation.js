import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { teacherAttendanceAPI } from "../api/teacherAttendance.api";
import { apiErrorToast } from "@/shared/utils/apiError";

const useTeacherAttendanceBulkMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      teacherAttendanceAPI.bulkRecord(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.teacherAttendance.all() });
      toast.success("Davomat saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => apiErrorToast(err),
  });
};

export default useTeacherAttendanceBulkMutation;
