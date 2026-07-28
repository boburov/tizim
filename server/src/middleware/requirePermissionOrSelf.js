import ApiError from "../utils/ApiError.js";
import { hasPermission } from "../helpers/permission.helper.js";
import { ROLES, ROLE_TYPES } from "../constants/roles.js";

// Permission bo'lsa o'tkazadi (owner/ruxsatli xodim).
// Aks holda - o'quvchi faqat O'ZINING ma'lumotini so'rasa ruxsat beradi.
// extractId(req) -> so'ralayotgan studentId (query yoki params dan).
const requirePermissionOrSelf = (key, extractId) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
  if (hasPermission(req.permissions, key)) return next();
  // Rol nomi emas, roleType - custom "o'quvchi tipidagi" rol ham o'z
  // ma'lumotini ko'ra olsin.
  if (req.role?.roleType === ROLE_TYPES.STUDENT || req.user.role === ROLES.STUDENT) {
    const want = String(extractId(req) || "");
    if (want && want === String(req.user._id)) return next();
  }
  return next(new ApiError(403, "Ruxsat etilmagan"));
};

export default requirePermissionOrSelf;
