import ApiError from "../utils/ApiError.js";
import { hasAnyPermission } from "../helpers/permission.helper.js";

/**
 * Ruxsat qo'riqchisi. Bir nechta kalit berilsa - HAR QANDAY biri yetarli (OR).
 *
 *   requirePermission("leads.read")                    // bitta
 *   requirePermission("leads.update", "leads.manage")  // biri yetarli
 *
 * NEGA OR: ruxsat kuchsizroq darajalarga bo'linganda (leads.manage →
 * leads.create + leads.update) route ikkalasiga ham ochiq bo'lishi kerak.
 * Iyerarxiya permission.helper.js dagi PERMISSION_IMPLIES orqali avtomatik
 * ham ishlaydi, lekin ochiq OR route'ni O'QIGANDA niyatni ko'rsatib turadi.
 *
 * Bitta kalit bilan chaqirilganda xulq-atvor AVVALGIDEK qoladi - mavjud
 * 200+ chaqiruvni o'zgartirish shart emas.
 */
const requirePermission =
  (...keys) =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
    if (!hasAnyPermission(req.permissions, keys)) {
      return next(new ApiError(403, "Ruxsat etilmagan"));
    }
    next();
  };

export default requirePermission;
