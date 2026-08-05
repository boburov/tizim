// TanStack Query
import { useQuery } from "@tanstack/react-query";

// API
import { usersAPI } from "../api/users.api";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Xodimlar statistikasi (rol kesimida). Holat filtriga bog'liq EMAS -
// serverdan faol/arxiv alohida keladi, shuning uchun "Faol/Arxiv"
// almashtirilganda kartochkalar qayta yuklanmaydi.
const useStaffStatsQuery = (options = {}) =>
  useQuery({
    queryKey: qk.users.staffStats(),
    queryFn: () => usersAPI.staffStats().then((r) => r.data.data),
    ...options,
  });

export default useStaffStatsQuery;
