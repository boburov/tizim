// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const storageAPI = {
  usage: () => http.get(ENDPOINTS.storage.usage),
};
