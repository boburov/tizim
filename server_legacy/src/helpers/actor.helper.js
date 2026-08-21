import { ROLES, ROLE_TYPES } from "../constants/roles.js";

/**
 * SO'ROVNI BAJARAYOTGAN ODAM (actor) - service qatlamiga uzatiladigan
 * yengil obyekt.
 *
 * NEGA kerak: `req.user` - User hujjati va undagi `role` bu ROL NOMI
 * ("teacher", lekin "katta_oqituvchi" ham bo'lishi mumkin). Rol TIPI
 * esa alohida hujjatda (`req.role.roleType`) turadi.
 *
 * Shuning uchun service ichidagi `currentUser.role === "teacher"` degan
 * tekshiruv CUSTOM rolni o'tkazib yuborardi: roleType'i "teacher" bo'lgan
 * "Katta o'qituvchi" o'qituvchi cheklovlariga TUSHMASDI va begona guruhga
 * ham yubora olardi. Actor ikkalasini birga olib yuradi.
 */
export const actorOf = (req) => {
  if (!req?.user) return null;
  return {
    _id: req.user._id,
    role: req.user.role,
    roleType: req.role?.roleType || null,
  };
};

// Rol NOMI ham, TIPI ham hisobga olinadi - qaysi biri kelsa ham ishlaydi.
const matches = (actor, roleValue, roleType) =>
  actor?.role === roleValue || actor?.roleType === roleType;

export const isTeacherActor = (actor) =>
  matches(actor, ROLES.TEACHER, ROLE_TYPES.TEACHER);

export const isStudentActor = (actor) =>
  matches(actor, ROLES.STUDENT, ROLE_TYPES.STUDENT);

export const isOwnerActor = (actor) =>
  matches(actor, ROLES.OWNER, ROLE_TYPES.OWNER);
