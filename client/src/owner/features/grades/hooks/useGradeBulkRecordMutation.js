import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { gradesAPI } from "../api/grades.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const useGradeBulkRecordMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, date, items, slot }) =>
      gradesAPI
        .bulkRecord(groupId, { date, items, slot: slot || "" })
        .then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.grades.all() });
      toast.success("Baholar saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export default useGradeBulkRecordMutation;
