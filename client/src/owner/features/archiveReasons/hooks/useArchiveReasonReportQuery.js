import { useQuery } from "@tanstack/react-query";
import { archiveReasonsAPI } from "../api/archiveReasons.api";
import { qk } from "@/shared/lib/query/keys";

const useArchiveReasonReportQuery = (params) =>
  useQuery({
    queryKey: qk.archiveReasons.report(params),
    queryFn: () => archiveReasonsAPI.report(params).then((r) => r.data.data),
  });

export default useArchiveReasonReportQuery;
