import http from "@/shared/api/http";

export const aiAPI = {
  insights: (params) => http.get("/ai/insights", { params }),
  actionCenter: (params) => http.get("/ai/action-center", { params }),
  // POST, chunki 500 tagacha ID query string'ga sig'maydi.
  bySubjects: (subjectIds) => http.post("/ai/insights/by-subjects", { subjectIds }),

  acknowledge: (id) => http.post(`/ai/insights/${id}/ack`),
  resolve: (id) => http.post(`/ai/insights/${id}/resolve`),
  dismiss: (id, reason) => http.post(`/ai/insights/${id}/dismiss`, { reason }),

  config: (branchId) => http.get("/ai/config", { params: { branchId } }),
  updateConfig: (body) => http.put("/ai/config", body),
  recompute: (branchId) => http.post("/ai/recompute", { branchId }),
};
