import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { leadsAPI } from "../api/leads.api";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";

const onErr = (options) => (err) => {
  apiErrorToast(err);
  options.onError?.(err);
};

export const useLeadCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => leadsAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Lid qo'shildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.update(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => leadsAPI.remove(id).then((r) => r.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("O'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadReminderMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.setReminder(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.leads.all() });
      toast.success("Eslatma saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

// Aylantirish keshni keng tozalaydi: o'quvchi paydo bo'ladi (users), guruhga
// qo'shilgan bo'lsa guruh tarkibi va davomat ro'yxati ham o'zgaradi.
const invalidateConverted = (qc) => {
  qc.invalidateQueries({ queryKey: qk.leads.all() });
  qc.invalidateQueries({ queryKey: qk.users.all() });
  qc.invalidateQueries({ queryKey: qk.groups.all() });
  qc.invalidateQueries({ queryKey: qk.attendance.all() });
};

export const useLeadConvertMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) =>
      leadsAPI.convert(id, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateConverted(qc);
      toast.success("Lid o'quvchiga aylantirildi");
      // Guruhga qo'shish alohida qadam: u yiqilsa aylantirish baribir
      // o'tgan - operator buni BILISHI kerak, jimgina yutib yubormaymiz.
      if (data?.groupError) {
        toast.warning(`Guruhga qo'shilmadi: ${data.groupError}`);
      }
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};

export const useLeadConvertBulkMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => leadsAPI.convertBulk(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateConverted(qc);
      // Toast bu yerda CHIQMAYDI: natija paneli har bir o'quvchining
      // login/parolini va yiqilganlarning sababini to'liq ko'rsatadi.
      options.onSuccess?.(data, vars, ctx);
    },
    onError: onErr(options),
  });
};
