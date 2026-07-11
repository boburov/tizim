import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { groupsAPI } from "../api/groups.api";

// O'qish davri o'zgarishi guruh detali + a'zolik ro'yxati + davomatga ta'sir qiladi.
const useInvalidate = (groupId, studentId) => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.groups.all() });
    qc.invalidateQueries({ queryKey: qk.groups.memberships(groupId, studentId) });
    qc.invalidateQueries({ queryKey: qk.attendance.all() });
  };
};

export const useMembershipUpdateMutation = (groupId, studentId, options = {}) => {
  const invalidate = useInvalidate(groupId, studentId);
  return useMutation({
    mutationFn: ({ membershipId, body }) =>
      groupsAPI.updateMembership(groupId, membershipId, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("O'qish davri yangilandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useMembershipRemoveMutation = (groupId, studentId, options = {}) => {
  const invalidate = useInvalidate(groupId, studentId);
  return useMutation({
    mutationFn: (membershipId) =>
      groupsAPI.removeMembership(groupId, membershipId).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("O'qish davri o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
