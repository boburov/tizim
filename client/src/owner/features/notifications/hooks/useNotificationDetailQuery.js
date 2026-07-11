import { useQuery } from "@tanstack/react-query";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";

export const useNotificationDetailQuery = (id) =>
  useQuery({
    queryKey: qk.notifications.one(id),
    queryFn: () => notificationsAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useNotificationRecipientsQuery = (id, params = {}) =>
  useQuery({
    queryKey: qk.notifications.recipients(id, params),
    queryFn: () => notificationsAPI.recipients(id, params).then((r) => r.data),
    enabled: !!id,
  });
