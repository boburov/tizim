import { useQuery } from "@tanstack/react-query";
import { archiveReasonsAPI } from "../api/archiveReasons.api";
import { qk } from "@/shared/lib/query/keys";

const useArchiveReasonsQuery = (params) =>
  useQuery({
    queryKey: qk.archiveReasons.list(params),
    queryFn: () => archiveReasonsAPI.list(params).then((r) => r.data),
  });

export default useArchiveReasonsQuery;
