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
  // Bir nechta o'quvchini bir martada qo'shish. force=true - dars to'qnashuviga
  // qaramay baribir qo'shish.
  addStudentsBulk: (id, { studentIds, joinedAt, leftAt, force }) =>
    http.post(ENDPOINTS.groups.studentsBulk(id), {
      studentIds,
      joinedAt,
      leftAt,
      force,
    }),
  removeStudent: (id, studentId, { reasonId, writeOff } = {}) =>
    http.delete(ENDPOINTS.groups.studentById(id, studentId), {
      data: {
        ...(reasonId ? { reasonId } : {}),
        ...(writeOff ? { writeOff: true } : {}),
      },
    }),

  // O'quvchining o'qish davrlari (membership)
  studentMemberships: (id, studentId) =>
    http.get(ENDPOINTS.groups.studentMemberships(id, studentId)),
  updateMembership: (id, membershipId, body) =>
    http.patch(ENDPOINTS.groups.membershipById(id, membershipId), body),
  removeMembership: (id, membershipId) =>
    http.delete(ENDPOINTS.groups.membershipById(id, membershipId)),

  history: (id, params) => http.get(ENDPOINTS.groups.history(id), { params }),

  // Guruhga biriktirish uchun bo'sh (jadvali to'qnashmaydigan) o'qituvchilar
  availableTeachers: (id) => http.get(ENDPOINTS.groups.availableTeachers(id)),

  // O'qituvchi dars berish DAVRLARI (manba haqiqati - timeline)
  teacherPeriods: (id) => http.get(ENDPOINTS.groups.teacherPeriods(id)),
  createTeacherPeriod: (id, body) =>
    http.post(ENDPOINTS.groups.teacherPeriods(id), body),
  updateTeacherPeriod: (id, pid, body) =>
    http.patch(ENDPOINTS.groups.teacherPeriodById(id, pid), body),
  removeTeacherPeriod: (id, pid) =>
    http.delete(ENDPOINTS.groups.teacherPeriodById(id, pid)),
};
