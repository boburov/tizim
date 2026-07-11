import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { systemNotificationsAPI } from "../api/systemNotifications.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

// Ro'yxat - status: "all" | "read" | "unread"
export const useSystemNotificationsQuery = (params = {}, { enabled = true } = {}) =>
  useQuery({
    queryKey: qk.systemNotifications.list(params),
    queryFn: () => systemNotificationsAPI.list(params).then((r) => r.data),
    enabled,
  });

// O'qilmaganlar counti - qo'ng'iroq badge'i uchun (30s polling)
export const useSystemUnreadCountQuery = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: qk.systemNotifications.unreadCount(),
    queryFn: () => systemNotificationsAPI.unreadCount().then((r) => r.data.data),
    enabled,
    refetchInterval: 30 * 1000,
    staleTime: 10 * 1000,
  });

// Kesh qiymati { count } ko'rinishida
const setUnread = (qc, fn) =>
  qc.setQueryData(qk.systemNotifications.unreadCount(), (prev) => {
    const cur = typeof prev === "number" ? prev : prev?.count || 0;
    return { ...(prev || {}), count: Math.max(0, fn(cur)) };
  });

export const useMarkSystemReadMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => systemNotificationsAPI.markRead(id).then((r) => r.data),
    // Optimistik: badge'ni darrov kamaytiramiz
    onMutate: () => setUnread(qc, (c) => c - 1),
    onError: () =>
      qc.invalidateQueries({ queryKey: qk.systemNotifications.unreadCount() }),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: qk.systemNotifications.all() }),
  });
};

export const useMarkAllSystemReadMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => systemNotificationsAPI.markAllRead().then((r) => r.data),
    onMutate: () => setUnread(qc, () => 0),
    onSuccess: () => toast.success("Hammasi o'qildi"),
    onError: (err) => {
      qc.invalidateQueries({ queryKey: qk.systemNotifications.unreadCount() });
      apiErrorToast(err);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: qk.systemNotifications.all() }),
  });
};
