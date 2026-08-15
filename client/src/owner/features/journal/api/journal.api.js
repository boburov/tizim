import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const journalAPI = {
  balances: (params) => http.get(ENDPOINTS.journal.balances, { params }),
  reconcile: () => http.get(ENDPOINTS.journal.reconcile),

  shifts: (params) => http.get(ENDPOINTS.journal.shifts, { params }),
  openShift: (body) => http.post(ENDPOINTS.journal.shifts, body),
  closeShift: (id, body) => http.post(ENDPOINTS.journal.shiftClose(id), body),

  transfers: (params) => http.get(ENDPOINTS.journal.transfers, { params }),
  send: (body) => http.post(ENDPOINTS.journal.transfers, body),
  receive: (id, body) => http.post(ENDPOINTS.journal.transferReceive(id), body),
  cancelTransfer: (id, body) => http.post(ENDPOINTS.journal.transferCancel(id), body),
};
