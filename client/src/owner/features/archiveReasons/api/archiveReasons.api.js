import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const archiveReasonsAPI = {
  list: (params) => http.get(ENDPOINTS.archiveReasons.base, { params }),
  byId: (id) => http.get(ENDPOINTS.archiveReasons.byId(id)),
  create: (body) => http.post(ENDPOINTS.archiveReasons.base, body),
  update: (id, body) => http.patch(ENDPOINTS.archiveReasons.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.archiveReasons.byId(id)),
  report: (params) => http.get(ENDPOINTS.archiveReasons.report, { params }),
};
