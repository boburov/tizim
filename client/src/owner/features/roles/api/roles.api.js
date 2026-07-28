import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const rolesAPI = {
  list: () => http.get(ENDPOINTS.roles.base),
  // Tizimda mavjud ruxsatlar jadvali (qatorlar = modullar, ustunlar = action).
  matrix: () => http.get(ENDPOINTS.roles.matrix),
  byValue: (value) => http.get(ENDPOINTS.roles.byValue(value)),
  create: (body) => http.post(ENDPOINTS.roles.base, body),
  update: (value, body) => http.patch(ENDPOINTS.roles.byValue(value), body),
  // Muzlatish/muzdan chiqarish
  setFrozen: (value, body) => http.patch(ENDPOINTS.roles.freeze(value), body),
  // migrateTo - rolda foydalanuvchi bo'lsa ularni qaysi rolga ko'chirish.
  remove: (value, migrateTo) =>
    http.delete(ENDPOINTS.roles.byValue(value), {
      params: migrateTo ? { migrateTo } : undefined,
    }),
  setUserRole: (userId, role) =>
    http.patch(ENDPOINTS.users.role(userId), { role }),
};
