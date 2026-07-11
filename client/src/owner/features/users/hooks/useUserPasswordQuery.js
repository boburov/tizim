import { useQuery } from "@tanstack/react-query";
import { usersAPI } from "../api/users.api";
import { qk } from "@/shared/lib/query/keys";

// Parol maxfiy - faqat modal ochilganda (enabled) so'raladi, cache'da saqlanmaydi
const useUserPasswordQuery = (id, enabled = true) =>
  useQuery({
    queryKey: qk.users.password(id),
    queryFn: () => usersAPI.getPassword(id).then((r) => r.data.data),
    enabled: !!id && enabled,
    staleTime: 0,
    gcTime: 0,
  });

export default useUserPasswordQuery;
