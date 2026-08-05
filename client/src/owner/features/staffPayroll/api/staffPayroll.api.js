import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

const E = ENDPOINTS.staffPayroll;

export const staffPayrollAPI = {
  // --- Maosh qatorlari ---
  list: (params) => http.get(E.base, { params }),
  byId: (id) => http.get(E.byId(id)),
  byEmployee: (employeeId) => http.get(E.byEmployee(employeeId)),
  generate: (body) => http.post(E.generate, body),
  recompute: (id) => http.post(E.recompute(id)),
  setLifecycle: (id, lifecycle) => http.patch(E.lifecycle(id), { lifecycle }),

  // --- Shartnomalar ---
  compensationsByEmployee: (employeeId) =>
    http.get(E.compensationsByEmployee(employeeId)),
  compensationsMissing: () => http.get(E.compensationsMissing),
  setCompensation: (body) => http.post(E.compensations, body),
  amendCompensation: (id, body) => http.patch(E.compensationById(id), body),
  removeCompensation: (id) => http.delete(E.compensationById(id)),

  // --- Bonus / jarima ---
  createAdjustment: (body) => http.post(E.adjustments, body),
  removeAdjustment: (id) => http.delete(E.adjustmentById(id)),

  // --- To'lov (202 tasdiq bo'lishi mumkin - javob TO'LIQ qaytariladi) ---
  createTransaction: (body) => http.post(E.transactions, body),
  removeTransaction: (id) => http.delete(E.transactionById(id)),

  // --- KPI ---
  triggers: () => http.get(E.kpiTriggers),
  rules: (params) => http.get(E.kpiRules, { params }),
  createRule: (body) => http.post(E.kpiRules, body),
  updateRule: (id, body) => http.patch(E.kpiRuleById(id), body),
  removeRule: (id) => http.delete(E.kpiRuleById(id)),
  assignments: (employeeId) => http.get(E.kpiAssignmentsByEmployee(employeeId)),
  setAssignment: (body) => http.post(E.kpiAssignments, body),
  removeAssignment: (id) => http.delete(E.kpiAssignmentById(id)),

  // --- HR / maosh tarixi ---
  impact: (employeeId) => http.get(E.historyImpact(employeeId)),
  // body: { payrollStartFrom, confirm?, reason? }
  setPayrollStart: (employeeId, body) => http.patch(E.payrollStart(employeeId), body),
  generateRange: (body) => http.post(E.generateRange, body),
  recalculate: (body) => http.post(E.recalculate, body),
  setLock: (body) => http.post(E.lock, body),
  preview: (body) => http.post(E.preview, body),
  timeline: (employeeId, params) => http.get(E.timeline(employeeId), { params }),
};

export default staffPayrollAPI;
