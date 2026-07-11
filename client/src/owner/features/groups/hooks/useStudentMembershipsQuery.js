import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { groupsAPI } from "../api/groups.api";

// O'quvchining guruhdagi BARCHA o'qish davrlari (yopiq + ochiq).
const useStudentMembershipsQuery = (groupId, studentId, options = {}) =>
  useQuery({
    queryKey: qk.groups.memberships(groupId, studentId),
    queryFn: () =>
      groupsAPI.studentMemberships(groupId, studentId).then((r) => r.data.data),
    enabled: !!groupId && !!studentId,
    ...options,
  });

export default useStudentMembershipsQuery;
