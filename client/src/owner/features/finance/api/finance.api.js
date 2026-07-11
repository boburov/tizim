// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const financeAPI = {
  // Guruh to'lovlari
  groupFees: (params) => http.get(ENDPOINTS.finance.groupFees, { params }),
  groupFeesByGroup: (gid) => http.get(ENDPOINTS.finance.groupFeesByGroup(gid)),
  upsertGroupFee: (body) => http.put(ENDPOINTS.finance.groupFees, body),

  // O'quvchi to'lovlari
  studentPayments: (params) =>
    http.get(ENDPOINTS.finance.studentPayments, { params }),
  studentObligations: (params) =>
    http.get(ENDPOINTS.finance.studentObligations, { params }),
  studentPayment: (id) => http.get(ENDPOINTS.finance.studentPaymentById(id)),
  studentPaymentHistory: (studentId) =>
    http.get(ENDPOINTS.finance.studentPaymentHistory(studentId)),

  // Kirim (tranzaksiyalar)
  addTransaction: (body) => http.post(ENDPOINTS.finance.transactions, body),
  removeTransaction: (id) => http.delete(ENDPOINTS.finance.transactionById(id)),

  // Chegirmalar
  discounts: (params) => http.get(ENDPOINTS.finance.discounts, { params }),
  createDiscount: (body) => http.post(ENDPOINTS.finance.discounts, body),
  updateDiscount: (id, body) => http.patch(ENDPOINTS.finance.discountById(id), body),
  removeDiscount: (id) => http.delete(ENDPOINTS.finance.discountById(id)),
};
