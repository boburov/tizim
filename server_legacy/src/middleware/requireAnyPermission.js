import ApiError from "../utils/ApiError.js";
import { hasPermission } from "../helpers/permission.helper.js";

/**
 * Berilgan ruxsatlardan KAMIDA BITTASI bo'lsa o'tkazadi (mantiqiy YOKI).
 *
 * Tasdiqlar ro'yxati uchun kerak: bitta endpoint ikki xil kategoriyaga
 * xizmat qiladi (moliya = finance.*, sozlama = approvals.decide_config),
 * shuning uchun route qatlamida keng, SERVIS qatlamida esa aniq kategoriya
 * bo'yicha tor tekshiruv bo'ladi. Route faqat "eshikni" ochadi - haqiqiy
 * kategoriya tekshiruvi assertCanDecide() ichida.
 */
const requireAnyPermission =
  (...keys) =>
  (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
    if (!keys.some((key) => hasPermission(req.permissions, key))) {
      return next(new ApiError(403, "Ruxsat etilmagan"));
    }
    next();
  };

export default requireAnyPermission;
