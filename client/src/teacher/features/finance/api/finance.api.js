// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const teacherFinanceAPI = {
  myFinance: () => http.get(ENDPOINTS.teacherSalary.myFinance),
};
