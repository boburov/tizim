import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const branchesAPI = {
  list: (params) => http.get(ENDPOINTS.branches.base, { params }),
  byId: (id) => http.get(ENDPOINTS.branches.byId(id)),
  stats: (id) => http.get(ENDPOINTS.branches.stats(id)),
  compare: () => http.get(ENDPOINTS.branches.compare),
  delegationOptions: () => http.get(ENDPOINTS.branches.delegationOptions),
  create: (body) => http.post(ENDPOINTS.branches.base, body),
  update: (id, body) => http.patch(ENDPOINTS.branches.byId(id), body),
  remove: (id) => http.delete(ENDPOINTS.branches.byId(id)),
};
