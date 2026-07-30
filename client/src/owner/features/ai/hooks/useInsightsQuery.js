import { useQuery } from "@tanstack/react-query";
import { qk } from "@/shared/lib/query/keys";
import { aiAPI } from "../api/ai.api";

export const useInsightsQuery = (params) =>
  useQuery({
    queryKey: qk.ai.list(params),
    queryFn: () => aiAPI.insights(params).then((r) => r.data),
  });

/**
 * Ro'yxat sahifasi uchun: N ta o'quvchining badge'ini BITTA so'rovda oladi.
 * Har bir qator uchun alohida so'rov (N+1) 200 qatorli jadvalda brauzerni
 * bo'g'ib qo'yardi.
 */
export const useInsightsBySubjects = (subjectIds = []) =>
  useQuery({
    queryKey: qk.ai.bySubjects(subjectIds),
    queryFn: () => aiAPI.bySubjects(subjectIds).then((r) => r.data.data),
    enabled: subjectIds.length > 0,
  });
