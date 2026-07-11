import { useQuery } from "@tanstack/react-query";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";

const useNotificationsQuery = (params) =>
  useQuery({
    queryKey: qk.notifications.list(params),
    queryFn: () => notificationsAPI.list(params).then((r) => r.data),
  });

export default useNotificationsQuery;
