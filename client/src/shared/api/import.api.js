// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

// Faylni multipart bilan yuboradi. onUploadProgress - yuklash chizig'i uchun.
const postFile = (url, file, onUploadProgress) => {
  const form = new FormData();
  form.append("file", file);
  return http.post(url, form, {
    // Content-Type ATAYLAB berilmaydi: brauzer uni multipart boundary
    // bilan birga o'zi qo'yadi. Qo'lda "multipart/form-data" yozilsa
    // boundary tushib qoladi va server faylni o'qiy olmaydi.
    headers: { "Content-Type": undefined },
    onUploadProgress,
  });
};

export const importAPI = {
  importers: () => http.get(ENDPOINTS.imports.importers),
  history: (params) => http.get(ENDPOINTS.imports.history, { params }),

  template: (key) =>
    http.get(ENDPOINTS.imports.template(key), { responseType: "blob" }),

  preview: (key, file, onUploadProgress) =>
    postFile(ENDPOINTS.imports.preview(key), file, onUploadProgress),

  commit: (key, file, onUploadProgress) =>
    postFile(ENDPOINTS.imports.commit(key), file, onUploadProgress),

  errorReport: (key, rows) =>
    http.post(ENDPOINTS.imports.errorReport(key), { rows }, { responseType: "blob" }),
};
