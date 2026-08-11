import { useQuery } from "@tanstack/react-query";
import { ratingAPI } from "../api/rating.api";
import { qk } from "@/shared/lib/query/keys";

// `options` - chaqiruvchi so'rovni O'CHIRIB qo'ya olishi uchun
// (`enabled: false`). Bunisiz "hozircha so'ramaslik" ni ifodalashning
// yagona yo'li yaroqsiz parametr yuborish edi - masalan `limit: 0` -
// va u serverdan 400 qaytarardi.
const useLeaderboardQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.rating.leaderboard(params),
    queryFn: () => ratingAPI.leaderboard(params).then((r) => r.data.data),
    ...options,
  });

export default useLeaderboardQuery;
