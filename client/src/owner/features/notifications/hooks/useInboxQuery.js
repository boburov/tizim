import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationsAPI } from "../api/notifications.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useInboxQuery = (params = {}) =>
  useQuery({
    queryKey: qk.notifications.inbox(params),
    queryFn: () => notificationsAPI.inbox(params).then((r) => r.data),
  });

// Yagona unread-count hook (NotificationBell ham shuni ishlatadi).
// enabled - login bo'lmaganda polling qilmaslik uchun.
export const useUnreadCountQuery = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: () => notificationsAPI.unreadCount().then((r) => r.data.data),
    enabled,
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });

// Kesh qiymati { count } ko'rinishida (unreadCount handler shunday qaytaradi)
const setUnread = (qc, fn) =>
  qc.setQueryData(qk.notifications.unreadCount(), (prev) => {
    const cur = typeof prev === "number" ? prev : prev?.count || 0;
    const next = Math.max(0, fn(cur));
    return typeof prev === "number" ? next : { ...(prev || {}), count: next };
  });

export const useMarkReadMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => notificationsAPI.markRead(id).then((r) => r.data),
    // Optimistik: badge'ni darrov kamaytiramiz (server javobini kutmasdan)
    onMutate: () => setUnread(qc, (c) => c - 1),
    onError: () =>
      qc.invalidateQueries({ queryKey: qk.notifications.unreadCount() }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "inbox"] });
    },
  });
};

export const useMarkAllReadMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsAPI.markAllRead().then((r) => r.data),
    onMutate: () => setUnread(qc, () => 0),
    onSuccess: () => toast.success("Hammasi o'qildi"),
    onError: (err) => {
      qc.invalidateQueries({ queryKey: qk.notifications.unreadCount() });
      apiErrorToast(err);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "inbox"] });
    },
  });
};
