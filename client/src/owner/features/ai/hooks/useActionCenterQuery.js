import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

const useActionCenterQuery = (params) =>
  useQuery({
    queryKey: qk.ai.actionCenter(params),
    queryFn: () => aiAPI.actionCenter(params).then((r) => r.data.data),
  });

export default useActionCenterQuery;
