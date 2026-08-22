import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { roomAnalyticsAPI } from "../api/rooms.api";

export const useRoomDashboardQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: ["branchAnalytics", "roomDashboard", params],
    queryFn: () => roomAnalyticsAPI.dashboard(params).then((r) => r.data.data),
    ...options,
  });

export const useRoomFinderQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: ["branchAnalytics", "roomFinder", params],
    queryFn: () => roomAnalyticsAPI.finder(params).then((r) => r.data.data),
    ...options,
  });

export const useRoomScheduleQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: ["branchAnalytics", "roomSchedule", params],
    queryFn: () => roomAnalyticsAPI.schedule(params).then((r) => r.data.data),
    ...options,
  });

export const useRoomDetailsQuery = (roomId, params = {}, options = {}) =>
  useQuery({
    queryKey: ["branchAnalytics", "roomDetails", roomId, params],
    queryFn: () => roomAnalyticsAPI.details(roomId, params).then((r) => r.data.data),
    enabled: !!roomId && (options.enabled ?? true),
    ...options,
  });
