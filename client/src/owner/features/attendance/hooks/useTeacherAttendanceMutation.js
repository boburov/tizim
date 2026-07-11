import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useTeacherAttendanceMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, date, present }) =>
      attendanceAPI
        .setTeacherAttendance(groupId, { date, present })
        .then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      qc.invalidateQueries({ queryKey: qk.groups.all() });
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(data?.message || "Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useTeacherAttendanceMutation;
