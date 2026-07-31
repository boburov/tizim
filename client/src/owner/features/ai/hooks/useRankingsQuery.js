import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

// REYTINGLAR - uchtasi bitta so'rovda.
//
// staleTime 5 daqiqa, brifing bilan bir xil: reyting tungi joblar
// yozgan snapshotdan o'qiladi va kun davomida o'zgarmaydi. Har fokusda
// qayta so'rash bir xil javobni qaytarardi.
const useRankingsQuery = () =>
  useQuery({
    queryKey: qk.ai.rankings(),
    queryFn: () => aiAPI.rankings().then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });

export default useRankingsQuery;
