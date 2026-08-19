import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

const E = ENDPOINTS.financeAnalytics;

/**
 * MOLIYA TAHLILI API.
 *
 * Har metod BEVOSITA serverdagi endpoint'ga mos keladi. Bu yerda
 * hech qanday hisob-kitob, birlashtirish yoki "qulaylik uchun"
 * o'zgartirish YO'Q — aks holda frontend backend bilan ajralib
 * ketadigan ikkinchi haqiqatga aylanardi.
 */
export const financeAnalyticsAPI = {
  summary: (params) => http.get(E.summary, { params }),
  alerts: (params) => http.get(E.alerts, { params }),

  revenueTrend: (params) => http.get(E.revenueTrend, { params }),
  revenueBy: (by, params) => http.get(E.revenueBy(by), { params }),
  paymentMethods: (params) => http.get(E.paymentMethods, { params }),
  refunds: (params) => http.get(E.refunds, { params }),
  discounts: (params) => http.get(E.discounts, { params }),

  expenseTrend: (params) => http.get(E.expenseTrend, { params }),
  expenseBreakdown: (params) => http.get(E.expenseBreakdown, { params }),
  costStructure: (params) => http.get(E.costStructure, { params }),
  recurring: (params) => http.get(E.recurring, { params }),
  budget: (params) => http.get(E.budget, { params }),

  cashFlow: (params) => http.get(E.cashFlow, { params }),
  accounts: (params) => http.get(E.accounts, { params }),
  cashTrend: (params) => http.get(E.cashTrend, { params }),

  receivables: (params) => http.get(E.receivables, { params }),
  receivablesBy: (by, params) => http.get(E.receivablesBy(by), { params }),

  teachers: (params) => http.get(E.teachers, { params }),
  directions: (params) => http.get(E.directions, { params }),
  groups: (params) => http.get(E.groups, { params }),
  rooms: (params) => http.get(E.rooms, { params }),
  branches: (params) => http.get(E.branches, { params }),
  entries: (params) => http.get(E.entries, { params }),
  entry: (id) => http.get(E.entry(id)),
};

/** Moliyaviy amallar (yozish). */
export const financeOpsAPI = {
  refund: (body) => http.post(ENDPOINTS.financeOps.refunds, body),
  transfer: (body) => http.post(ENDPOINTS.financeOps.transfers, body),
  ownerCapital: (body) => http.post(ENDPOINTS.financeOps.ownerCapital, body),

  // Byudjet — REJA ma'lumoti, jurnalga yozilmaydi.
  budgets: (params) => http.get(ENDPOINTS.financeOps.budgets, { params }),
  budget: (id) => http.get(ENDPOINTS.financeOps.budgetById(id)),
  createBudget: (body) => http.post(ENDPOINTS.financeOps.budgets, body),
  updateBudget: (id, body) => http.patch(ENDPOINTS.financeOps.budgetById(id), body),
  removeBudget: (id) => http.delete(ENDPOINTS.financeOps.budgetById(id)),
};
