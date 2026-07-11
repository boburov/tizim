import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceSettingsAPI } from "../api/attendanceSettings.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useAttendanceSettingsQuery = () =>
  useQuery({
    queryKey: qk.attendanceSettings.one(),
    queryFn: () => attendanceSettingsAPI.get().then((r) => r.data.data),
  });

export const useAttendanceSettingsUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) =>
      attendanceSettingsAPI.update(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendanceSettings.one() });
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("Sozlamalar saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
