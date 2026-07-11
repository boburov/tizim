// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const studentGroupAPI = {
  myActive: () => http.get(ENDPOINTS.groups.myActive),
  markRemovalNoticeSeen: () => http.post(ENDPOINTS.groups.removalNoticeSeen),
};
