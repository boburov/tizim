import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

export const useLeadConversionQuery = (params = {}) =>
  useQuery({
    queryKey: qk.leads.conversion(params),
    queryFn: () =>
      http.get(ENDPOINTS.leads.conversion, { params }).then((r) => r.data.data),
  });

export const useRoutingRulesQuery = () =>
  useQuery({
    queryKey: qk.leads.routing(),
    queryFn: () => http.get(ENDPOINTS.leads.routing).then((r) => r.data.data),
  });

const useRoutingMutation = (fn, msg, options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.routing() });
      toast.success(msg);
      options.onSuccess?.(data, vars, ctx);
    },
    onError: (err) => {
      apiErrorToast(err);
      options.onError?.(err);
    },
  });
};

export const useRoutingCreateMutation = (o) =>
  useRoutingMutation(
    (body) => http.post(ENDPOINTS.leads.routing, body).then((r) => r.data.data),
    "Qoida qo'shildi",
    o,
  );

export const useRoutingRemoveMutation = (o) =>
  useRoutingMutation(
    (id) => http.delete(ENDPOINTS.leads.routingById(id)).then((r) => r.data),
    "Qoida o'chirildi",
    o,
  );
