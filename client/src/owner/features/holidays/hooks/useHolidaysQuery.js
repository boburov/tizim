import { useQuery } from "@tanstack/react-query";
import { holidaysAPI } from "../api/holidays.api";
import { qk } from "@/shared/lib/query/keys";

const useHolidaysQuery = (params) =>
  useQuery({
    queryKey: qk.holidays.list(params),
    queryFn: () => holidaysAPI.list(params).then((r) => r.data),
  });

export default useHolidaysQuery;
