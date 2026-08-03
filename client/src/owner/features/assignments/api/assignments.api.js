// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

/**
 * Vazifa yuborish - multipart, chunki matn bilan birga FAYL ham ketadi.
 *
 * Content-Type ATAYLAB berilmaydi: brauzer uni multipart boundary bilan
 * birga o'zi qo'yadi. Qo'lda "multipart/form-data" yozilsa boundary
 * tushib qoladi va server faylni o'qiy olmaydi.
 */
const buildForm = ({ title, body, groupIds, dueDate, file }) => {
  const form = new FormData();
  form.append("title", title);
  form.append("body", body || "");
  // Har bir guruh alohida maydon: server ikkala shaklni ham (massiv va
  // vergulli satr) qabul qiladi, lekin massiv aniqroq.
  (groupIds || []).forEach((id) => form.append("groupIds", id));
  if (dueDate) form.append("dueDate", dueDate);
  if (file) form.append("file", file);
  return form;
};

export const assignmentsAPI = {
  list: (params) => http.get(ENDPOINTS.assignments.base, { params }),
  byId: (id) => http.get(ENDPOINTS.assignments.byId(id)),
  recipients: (id, params) =>
    http.get(ENDPOINTS.assignments.recipients(id), { params }),
  preview: (groupIds) =>
    http.post(ENDPOINTS.assignments.preview, { groupIds }),
  remove: (id) => http.delete(ENDPOINTS.assignments.byId(id)),

  create: (payload, onUploadProgress) =>
    http.post(ENDPOINTS.assignments.base, buildForm(payload), {
      headers: { "Content-Type": undefined },
      onUploadProgress,
    }),

  download: (id) =>
    http.get(ENDPOINTS.assignments.file(id), { responseType: "blob" }),

  // O'quvchi yuzasi
  my: (params) => http.get(ENDPOINTS.assignments.my, { params }),
  markRead: (id) => http.post(ENDPOINTS.assignments.markRead(id)),
};
