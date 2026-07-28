import ApiError from "../utils/ApiError.js";
import { ROLES } from "../constants/roles.js";
import { hasPermission } from "../helpers/permission.helper.js";
import { PERMISSIONS } from "../constants/permissions.js";

// Rol nomiga qarab ruxsat beradi, LEKIN rollar dinamik bo'lgani uchun
// ikkita kengaytma bilan - shunda custom rollar hard-block bo'lmaydi:
//
//  1) roleType: requireRole("teacher") custom "Katta o'qituvchi" rolini ham
//     o'tkazadi, agar uning roleType'i "teacher" bo'lsa.
//  2) requireRole("owner") - owner'ga xos route'lar. Custom rolda
//     "system.admin_access" ruxsati bo'lsa, u ham o'tadi.
//
// Yangi kod uchun requirePermission(...) afzal; bu middleware mavjud
// route'larni buzmasdan custom rollarni qo'llab-quvvatlash uchun.
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));

  // To'g'ridan-to'g'ri rol nomi mos keldi (built-in holat).
  if (roles.includes(req.user.role)) return next();

  // roleType bo'yicha moslik: custom rol built-in rol o'rnini bosa oladi.
  const roleType = req.role?.roleType;
  if (roleType && roles.includes(roleType)) return next();

  // Owner-only route'lar: system.admin_access ruxsatiga ega custom rol o'tadi.
  if (
    roles.includes(ROLES.OWNER) &&
    hasPermission(req.permissions, PERMISSIONS.SYSTEM_ADMIN_ACCESS)
  ) {
    return next();
  }

  return next(new ApiError(403, "Ruxsat etilmagan"));
};

export default requireRole;
