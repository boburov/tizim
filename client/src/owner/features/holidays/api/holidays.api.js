import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const holidaysAPI = {
  list: (params) => http.get(ENDPOINTS.holidays.base, { params }),
  byId: (id) => http.get(ENDPOINTS.holidays.byId(id)),
  create: (body) => http.post(ENDPOINTS.holidays.base, body),
  update: (id, body) => http.patch(ENDPOINTS.holidays.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.holidays.byId(id)),

  teacherBirthdays: () => http.get(ENDPOINTS.holidays.teacherBirthdays),
  congratulate: (id, body) =>
    http.post(ENDPOINTS.holidays.congratulate(id), body),
};
