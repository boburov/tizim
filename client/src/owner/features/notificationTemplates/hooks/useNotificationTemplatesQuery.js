import { useQuery } from "@tanstack/react-query";
import { notificationTemplatesAPI } from "../api/notificationTemplates.api";
import { qk } from "@/shared/lib/query/keys";

const useNotificationTemplatesQuery = (params) =>
  useQuery({
    queryKey: qk.notificationTemplates.list(params),
    queryFn: () =>
      notificationTemplatesAPI.list(params).then((r) => r.data),
  });

export default useNotificationTemplatesQuery;
