import { ROLES, ROLE_TYPES } from '../constants/permissions.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * SO'ROVNI BAJARAYOTGAN ODAM (actor) — `helpers/actor.helper.js` NING
 * KO'CHIRMASI.
 *
 * NEGA kerak: `req.user` — User yozuvi va undagi `role` bu ROL NOMI
 * ("teacher", lekin "katta_oqituvchi" ham bo'lishi mumkin). Rol TIPI
 * esa alohida yozuvda (`req.role.roleType`) turadi.
 *
 * Shuning uchun servis ichidagi `currentUser.role === "teacher"` degan
 * tekshiruv CUSTOM rolni o'tkazib yuborardi: roleType'i "teacher"
 * bo'lgan "Katta o'qituvchi" o'qituvchi cheklovlariga TUSHMASDI va
 * begona guruhga ham yubora olardi. Actor ikkalasini birga olib yuradi.
 */
export interface Actor {
  _id: string;
  role: string;
  roleType: string | null;
}

export const actorOf = (req: AuthenticatedRequest | null): Actor | null => {
  if (!req?.user) return null;
  return {
    // ⚠ `_id` ATAYLAB: Express `auth.js` `req.user` ga shu taxallusni
    // qo'yadi va servis qatlami aynan shuni o'qiydi. NestJS
    // `AuthMiddleware` ham `_id` ni beradi.
    _id: String(req.user._id),
    role: req.user.role,
    roleType: req.role?.roleType || null,
  };
};

// Rol NOMI ham, TIPI ham hisobga olinadi — qaysi biri kelsa ham ishlaydi.
const matches = (actor: Actor | null | undefined, roleValue: string, roleType: string) =>
  actor?.role === roleValue || actor?.roleType === roleType;

export const isTeacherActor = (actor?: Actor | null) =>
  matches(actor, ROLES.TEACHER, ROLE_TYPES.TEACHER);

export const isStudentActor = (actor?: Actor | null) =>
  matches(actor, ROLES.STUDENT, ROLE_TYPES.STUDENT);

export const isOwnerActor = (actor?: Actor | null) =>
  matches(actor, ROLES.OWNER, ROLE_TYPES.OWNER);
