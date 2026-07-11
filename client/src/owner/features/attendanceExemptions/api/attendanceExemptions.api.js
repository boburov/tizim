import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const attendanceExemptionsAPI = {
  list: (params) => http.get(ENDPOINTS.attendanceExemptions.base, { params }),
  create: (body) => http.post(ENDPOINTS.attendanceExemptions.base, body),
  update: (id, body) =>
    http.patch(ENDPOINTS.attendanceExemptions.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.attendanceExemptions.byId(id)),
};
