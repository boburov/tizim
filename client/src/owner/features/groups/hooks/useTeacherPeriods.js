import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { groupsAPI } from "../api/groups.api";

export const useTeacherPeriodsQuery = (groupId, options = {}) =>
  useQuery({
    queryKey: qk.groups.teacherPeriods(groupId),
    queryFn: () => groupsAPI.teacherPeriods(groupId).then((r) => r.data.data),
    enabled: !!groupId,
    ...options,
  });

// O'qituvchi davri o'zgarishi → guruh (teachers keshi) + maosh query'lari.
const useInvalidate = (groupId) => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.groups.teacherPeriods(groupId) });
    qc.invalidateQueries({ queryKey: qk.groups.one(groupId) });
    qc.invalidateQueries({ queryKey: qk.teacherSalary.all() });
  };
};

export const useTeacherPeriodCreateMutation = (groupId, options = {}) => {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (body) => groupsAPI.createTeacherPeriod(groupId, body).then((r) => r.data.data),
    onSuccess: (...a) => {
      invalidate();
      toast.success("Dars berish davri qo'shildi");
      options.onSuccess?.(...a);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useTeacherPeriodUpdateMutation = (groupId, options = {}) => {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: ({ id, body }) =>
      groupsAPI.updateTeacherPeriod(groupId, id, body).then((r) => r.data.data),
    onSuccess: (...a) => {
      invalidate();
      toast.success("Dars berish davri yangilandi");
      options.onSuccess?.(...a);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useTeacherPeriodRemoveMutation = (groupId, options = {}) => {
  const invalidate = useInvalidate(groupId);
  return useMutation({
    mutationFn: (id) => groupsAPI.removeTeacherPeriod(groupId, id).then((r) => r.data.data),
    onSuccess: (...a) => {
      invalidate();
      toast.success("Dars berish davri o'chirildi");
      options.onSuccess?.(...a);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};
