import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const expenseApprovalsAPI = {
  list: (params) => http.get(ENDPOINTS.expenseApprovals.base, { params }),
  byId: (id) => http.get(ENDPOINTS.expenseApprovals.byId(id)),
  pendingCount: () => http.get(ENDPOINTS.expenseApprovals.pendingCount),
  stats: () => http.get(ENDPOINTS.expenseApprovals.stats),
  approve: (id, body) => http.post(ENDPOINTS.expenseApprovals.approve(id), body),
  reject: (id, body) => http.post(ENDPOINTS.expenseApprovals.reject(id), body),
  cancel: (id) => http.post(ENDPOINTS.expenseApprovals.cancel(id)),
  retry: (id) => http.post(ENDPOINTS.expenseApprovals.retry(id)),
  bulkApprove: (body) => http.post(ENDPOINTS.expenseApprovals.bulkApprove, body),
  bulkReject: (body) => http.post(ENDPOINTS.expenseApprovals.bulkReject, body),
};
