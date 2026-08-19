import { useQuery } from "@tanstack/react-query";

import { qk } from "@/shared/lib/query/keys";

import { roomAnalyticsAPI } from "../api/rooms.api";

/**
 * @param {{ branchId?: string, dayStart?: number, dayEnd?: number }} params
 * @param {object} options — `enabled` uchun (tab ochilmaguncha so'rov ketmasin)
 */
const useRoomUtilizationQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: qk.branchAnalytics.roomUtilization(params),
    queryFn: () => roomAnalyticsAPI.utilization(params).then((r) => r.data.data),
    ...options,
  });

export default useRoomUtilizationQuery;
