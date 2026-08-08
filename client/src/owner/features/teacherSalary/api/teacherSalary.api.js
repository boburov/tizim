// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const teacherSalaryAPI = {
  // Maoshlar (stavka/ish-oynasi davrlardan derived - read-only)
  salaries: (params) => http.get(ENDPOINTS.teacherSalary.salaries, { params }),
  salary: (id) => http.get(ENDPOINTS.teacherSalary.salaryById(id)),
  salaryHistory: (teacherId) =>
    http.get(ENDPOINTS.teacherSalary.salaryHistory(teacherId)),
  salaryBalance: (teacherId) =>
    http.get(ENDPOINTS.teacherSalary.salaryBalance(teacherId)),
  obligations: (params) => http.get(ENDPOINTS.teacherSalary.obligations, { params }),

  // To'lovlar (chiqim)
  addTransaction: (body) => http.post(ENDPOINTS.teacherSalary.transactions, body),
  removeTransaction: (id) =>
    http.delete(ENDPOINTS.teacherSalary.transactionById(id)),

  // ── STANDART MAOSH STAVKASI ──
  // setCompensation YANGI davr ochadi (eskisini yopadi) - maosh TARIXI
  // saqlanadi. amend esa amaldagi stavkani TUZATADI (xato kiritish uchun).
  compensations: (teacherId) =>
    http.get(ENDPOINTS.teacherSalary.compensationsByTeacher(teacherId)),
  setCompensation: (body) =>
    http.post(ENDPOINTS.teacherSalary.compensations, body),
  amendCompensation: (id, body) =>
    http.patch(ENDPOINTS.teacherSalary.compensationById(id), body),
  removeCompensation: (id) =>
    http.delete(ENDPOINTS.teacherSalary.compensationById(id)),

  // ── KPI mukofoti / jarima ──
  addAdjustment: (body) => http.post(ENDPOINTS.teacherSalary.adjustments, body),
  removeAdjustment: (id) =>
    http.delete(ENDPOINTS.teacherSalary.adjustmentById(id)),
};
