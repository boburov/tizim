// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const teacherSalaryAPI = {
  // Maoshlar (stavka/ish-oynasi davrlardan derived - read-only)
  salaries: (params) => http.get(ENDPOINTS.teacherSalary.salaries, { params }),
  salary: (id) => http.get(ENDPOINTS.teacherSalary.salaryById(id)),
  salaryHistory: (teacherId) =>
    http.get(ENDPOINTS.teacherSalary.salaryHistory(teacherId)),
  obligations: (params) => http.get(ENDPOINTS.teacherSalary.obligations, { params }),

  // To'lovlar (chiqim)
  addTransaction: (body) => http.post(ENDPOINTS.teacherSalary.transactions, body),
  removeTransaction: (id) =>
    http.delete(ENDPOINTS.teacherSalary.transactionById(id)),
};
