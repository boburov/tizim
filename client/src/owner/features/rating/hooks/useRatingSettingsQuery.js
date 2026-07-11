import { useQuery } from "@tanstack/react-query";
import { ratingAPI } from "../api/rating.api";
import { qk } from "@/shared/lib/query/keys";

const useRatingSettingsQuery = () =>
  useQuery({
    queryKey: qk.rating.settings(),
    queryFn: () => ratingAPI.getSettings().then((r) => r.data.data),
  });

export default useRatingSettingsQuery;
