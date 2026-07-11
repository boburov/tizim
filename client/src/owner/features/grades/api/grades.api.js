import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const gradesAPI = {
  listForGroupDate: (groupId, date, slot) =>
    http.get(ENDPOINTS.grades.groupOnDate(groupId), {
      params: slot !== undefined && slot !== null ? { date, slot } : { date },
    }),
  bulkRecord: (groupId, body) =>
    http.post(ENDPOINTS.grades.bulk(groupId), body),
  groupSummary: (groupId, params) =>
    http.get(ENDPOINTS.grades.groupSummary(groupId), { params }),
  studentSummary: (studentId, params) =>
    http.get(ENDPOINTS.grades.studentSummary(studentId), { params }),
};
