// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const studentFreezeAPI = {
  // Bitta o'quvchining muzlatish tarixi
  listForStudent: (studentId) =>
    http.get(ENDPOINTS.studentFreezes.byStudent(studentId)),
  freeze: (studentId, body) =>
    http.post(ENDPOINTS.studentFreezes.freeze(studentId), body),
  unfreeze: (studentId, body) =>
    http.post(ENDPOINTS.studentFreezes.unfreeze(studentId), body),
};
