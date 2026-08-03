// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { teacherGroupsAPI } from "../api/groups.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// `options` - chaqiruvchi so'rovni o'chira olishi uchun (`enabled: false`).
// Guruh tanlagichi ikkala panelda ishlatiladi va owner panelida "mening
// guruhlarim" so'rovi bekorga ketmasligi kerak.
const useMyGroupsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.groups.myTeach(),
    queryFn: () => teacherGroupsAPI.myTeach().then((r) => r.data.data),
    ...options,
  });

export default useMyGroupsQuery;
