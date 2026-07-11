import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const depositsAPI = {
  studentSummary: (studentId) =>
    http.get(ENDPOINTS.deposits.studentSummary(studentId)),
  studentHistory: (studentId) =>
    http.get(ENDPOINTS.deposits.studentHistory(studentId)),
  transactions: (params) => http.get(ENDPOINTS.deposits.transactions, { params }),
  report: (params) => http.get(ENDPOINTS.deposits.report, { params }),

  topup: (body) => http.post(ENDPOINTS.deposits.topup, body),
  withdraw: (body) => http.post(ENDPOINTS.deposits.withdraw, body),
  apply: (body) => http.post(ENDPOINTS.deposits.apply, body),
  removeTransaction: (id) => http.delete(ENDPOINTS.deposits.transactionById(id)),
};
