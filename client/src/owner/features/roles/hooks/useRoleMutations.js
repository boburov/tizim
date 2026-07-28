import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/shared/lib/query/keys";
import { apiErrorToast } from "@/shared/utils/apiError";
import { rolesAPI } from "../api/roles.api";

const handleErr = (err) => apiErrorToast(err);

// Rol o'zgarganda ruxsatlar ham o'zgargan bo'lishi mumkin - joriy
// foydalanuvchining /auth/me javobini ham yangilaymiz, shunda sidebar va
// tugmalar qayta login'siz darhol yangilanadi.
const invalidateAll = (qc) => {
  qc.invalidateQueries({ queryKey: qk.roles.all() });
  qc.invalidateQueries({ queryKey: qk.auth.me() });
};

export const useRoleCreateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => rolesAPI.create(body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("Rol yaratildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useRoleUpdateMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ value, body }) =>
      rolesAPI.update(value, body).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success("Saqlandi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

// Muzlatish: rol egasi panelga kira olmay qoladi (mavjud sessiyalari ham uziladi).
export const useRoleFreezeMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ value, isFrozen, reason }) =>
      rolesAPI.setFrozen(value, { isFrozen, reason }).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      toast.success(vars.isFrozen ? "Rol muzlatildi" : "Rol muzdan chiqarildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useRoleRemoveMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ value, migrateTo }) =>
      rolesAPI.remove(value, migrateTo).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      invalidateAll(qc);
      // Foydalanuvchilar boshqa rolga ko'chgan bo'lishi mumkin.
      qc.invalidateQueries({ queryKey: qk.users.all() });
      toast.success("Rol o'chirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};

export const useSetUserRoleMutation = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }) =>
      rolesAPI.setUserRole(userId, role).then((r) => r.data.data),
    onSuccess: (data, vars, ctx) => {
      qc.invalidateQueries({ queryKey: qk.users.all() });
      qc.invalidateQueries({ queryKey: qk.roles.all() });
      toast.success("Foydalanuvchi roli o'zgartirildi");
      options.onSuccess?.(data, vars, ctx);
    },
    onError: handleErr,
  });
};
