import { useQuery } from "@tanstack/react-query";
import { groupsAPI } from "../api/groups.api";
import { qk } from "@/shared/lib/query/keys";

// Guruhga biriktirish uchun bo'sh (jadvali to'qnashmaydigan) o'qituvchilar.
// Band o'qituvchilar server tomonida chiqarib tashlanadi.
const useAvailableTeachersQuery = (groupId, options = {}) =>
  useQuery({
    queryKey: qk.groups.availableTeachers(groupId),
    queryFn: () => groupsAPI.availableTeachers(groupId).then((r) => r.data.data),
    enabled: !!groupId && options.enabled !== false,
  });

export default useAvailableTeachersQuery;
