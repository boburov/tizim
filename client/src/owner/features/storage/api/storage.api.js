// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const storageAdminAPI = {
  settings: () => http.get(ENDPOINTS.storage.settings),
  updateSettings: (body) => http.patch(ENDPOINTS.storage.settings, body),

  // Ikki qadam: avval "nima o'chadi" (preview), keyin bajarish.
  // Bu ATAYLAB - "hammasini o'chirish" bir bosishda bo'lmasligi kerak.
  cleanupPreview: (body) => http.post(ENDPOINTS.storage.cleanupPreview, body),
  cleanup: (body) => http.post(ENDPOINTS.storage.cleanup, body),

  files: (params) => http.get(ENDPOINTS.storage.files, { params }),
  removeFile: (id) => http.delete(ENDPOINTS.storage.fileById(id)),
};
