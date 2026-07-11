// TanStack Query
import { useQuery } from "@tanstack/react-query";

// HTTP
import http from "@/shared/api/http";

// Query keys
import { qk } from "@/shared/lib/query/keys";

// Global qidiruv: o'quvchi/o'qituvchi/guruhlarni bir so'rovda topadi.
// ⌘K oynasida ishlatiladi. `term` 2+ belgidan kichik bo'lsa so'rov yubormaymiz.
const useGlobalSearchQuery = (term) => {
  const q = (term || "").trim();
  return useQuery({
    queryKey: qk.search.global(q),
    queryFn: () =>
      http.get("/search", { params: { q } }).then((r) => r.data.data),
    enabled: q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // yangi harf yozilganda eski natija "sakramaydi"
  });
};

export default useGlobalSearchQuery;
