import { useQuery } from "@tanstack/react-query";
import { feedbackAPI } from "../api/feedback.api";
import { qk } from "@/shared/lib/query/keys";

export const useFeedbackListQuery = (params) =>
  useQuery({
    queryKey: qk.feedback.list(params),
    queryFn: () => feedbackAPI.list(params).then((r) => r.data),
  });

export const useFeedbackDetailQuery = (id) =>
  useQuery({
    queryKey: qk.feedback.one(id),
    queryFn: () => feedbackAPI.byId(id).then((r) => r.data.data),
    enabled: !!id,
  });

export const useMyFeedbackQuery = (params = {}) =>
  useQuery({
    queryKey: qk.feedback.me(params),
    queryFn: () => feedbackAPI.me(params).then((r) => r.data),
  });

export const useFeedbackStatsQuery = (params = {}) =>
  useQuery({
    queryKey: qk.feedback.stats(params),
    queryFn: () => feedbackAPI.stats(params).then((r) => r.data.data),
  });
