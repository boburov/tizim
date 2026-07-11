import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const teacherAttendanceAPI = {
  listForDate: (date) =>
    http.get(ENDPOINTS.teacherAttendance.base, { params: { date } }),
  bulkRecord: (body) => http.post(ENDPOINTS.teacherAttendance.bulk, body),
};
