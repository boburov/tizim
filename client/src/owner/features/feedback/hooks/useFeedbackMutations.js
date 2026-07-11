import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { feedbackAPI } from "../api/feedback.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const handleErr = (err) =>
  apiErrorToast(err);

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: qk.feedback.all() });
};

export const useSubmitFeedbackMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body) => feedbackAPI.submit(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Feedback yuborildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useReviewMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id) => feedbackAPI.review(id).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Ko'rib chiqishga o'tkazildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useReplyMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, message }) =>
      feedbackAPI.reply(id, { message }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Javob saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useResolveMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, adminReply }) =>
      feedbackAPI.resolve(id, { adminReply }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Hal qilindi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useRejectMutation = (options = {}) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, rejectionReason }) =>
      feedbackAPI.reject(id, { rejectionReason }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidate();
      toast.success("Rad etildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};
