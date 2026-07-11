import { useQuery } from "@tanstack/react-query";
import { ratingAPI } from "../api/rating.api";
import { qk } from "@/shared/lib/query/keys";

const useLeaderboardQuery = (params = {}) =>
  useQuery({
    queryKey: qk.rating.leaderboard(params),
    queryFn: () => ratingAPI.leaderboard(params).then((r) => r.data.data),
  });

export default useLeaderboardQuery;
