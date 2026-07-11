import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { attendanceAPI } from "../api/attendance.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useBulkRecordMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, date, items, slot }) =>
      attendanceAPI
        .bulkRecord(groupId, { date, items, slot: slot || "" })
        .then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.attendance.all() });
      toast.success("Davomat saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useBulkRecordMutation;
