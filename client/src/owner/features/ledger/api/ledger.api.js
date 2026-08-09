// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const ledgerAPI = {
  // Shaxsning to'liq moliyaviy tarixi + joriy balansi.
  statement: (userId, params) =>
    http.get(ENDPOINTS.ledger.statement(userId), { params }),
  // O'z balansi (o'qituvchi/o'quvchi paneli).
  my: (params) => http.get(ENDPOINTS.ledger.my, { params }),
};

export const openingBalanceAPI = {
  // DIQQAT: bu amal QAYTARIB BO'LMAYDI - yozuv o'zgarmas (immutable) va
  // bitta odamga faqat BIR MARTA kiritiladi.
  create: (body) => http.post(ENDPOINTS.openingBalance.root, body),
  list: (params) => http.get(ENDPOINTS.openingBalance.root, { params }),
  repair: () => http.post(ENDPOINTS.openingBalance.repair),
};
