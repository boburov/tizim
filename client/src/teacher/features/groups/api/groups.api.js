// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const teacherGroupsAPI = {
  myTeach: () => http.get(ENDPOINTS.groups.myTeach),
  byId: (id) => http.get(ENDPOINTS.groups.byId(id)),
};
