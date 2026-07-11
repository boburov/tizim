import { useQuery } from "@tanstack/react-query";
import { feedbackTypesAPI } from "../api/feedbackTypes.api";
import { qk } from "@/shared/lib/query/keys";

const useFeedbackTypesQuery = (params) =>
  useQuery({
    queryKey: qk.feedbackTypes.list(params),
    queryFn: () => feedbackTypesAPI.list(params).then((r) => r.data),
  });

export default useFeedbackTypesQuery;
