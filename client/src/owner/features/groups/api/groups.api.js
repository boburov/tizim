// API
import http from "@/shared/api/http";
import { ENDPOINTS } from "@/shared/api/endpoints";

export const groupsAPI = {
  list: (params) => http.get(ENDPOINTS.groups.base, { params }),
  byId: (id) => http.get(ENDPOINTS.groups.byId(id)),
  create: (body) => http.post(ENDPOINTS.groups.base, body),
  update: (id, body) => http.patch(ENDPOINTS.groups.byId(id), body),
  permanentRemove: (id, body) =>
    http.delete(`${ENDPOINTS.groups.byId(id)}/permanent`, { data: body }),

  addStudent: (id, studentId, joinedAt, leftAt) =>
    http.post(ENDPOINTS.groups.students(id), { studentId, joinedAt, leftAt }),
  removeStudent: (id, studentId, reasonId) =>
    http.delete(ENDPOINTS.groups.studentById(id, studentId), {
      data: reasonId ? { reasonId } : {},
    }),

  // O'quvchining o'qish davrlari (membership)
  studentMemberships: (id, studentId) =>
    http.get(ENDPOINTS.groups.studentMemberships(id, studentId)),
  updateMembership: (id, membershipId, body) =>
    http.patch(ENDPOINTS.groups.membershipById(id, membershipId), body),
  removeMembership: (id, membershipId) =>
    http.delete(ENDPOINTS.groups.membershipById(id, membershipId)),

  history: (id, params) => http.get(ENDPOINTS.groups.history(id), { params }),

  // O'qituvchi dars berish DAVRLARI (manba haqiqati - timeline)
  teacherPeriods: (id) => http.get(ENDPOINTS.groups.teacherPeriods(id)),
  createTeacherPeriod: (id, body) =>
    http.post(ENDPOINTS.groups.teacherPeriods(id), body),
  updateTeacherPeriod: (id, pid, body) =>
    http.patch(ENDPOINTS.groups.teacherPeriodById(id, pid), body),
  removeTeacherPeriod: (id, pid) =>
    http.delete(ENDPOINTS.groups.teacherPeriodById(id, pid)),
};
