import ApiError from "../utils/ApiError.js";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { getLimit, isFeatureEnabled, UNLIMITED } from "../config/entitlements.js";

/**
 * Tarif limitini tekshiradi. Yangi yozuv YARATISHDAN oldin ishlatiladi.
 *
 * Limitlar admin paneldan heartbeat orqali keladi va mahalliy keshda turadi
 * (config/entitlements.js). Tekshiruv shu yerda — tenant serverda — bo'ladi,
 * chunki admin server o'chib qolganda ham tizim ishlashi kerak.
 *
 * Ishlatilishi:
 *   router.post("/", requireAuth, enforceLimit("max_students", countStudents), create)
 *
 * @param {string} featureKey  Tarifdagi kalit (masalan "max_students")
 * @param {Function} countFn   Hozirgi sonni qaytaruvchi async funksiya
 */
export const enforceLimit = (featureKey, countFn) => async (req, _res, next) => {
  try {
    const limit = getLimit(featureKey);

    // Cheksiz yoki limit kelmagan — o'tkazamiz
    if (limit === UNLIMITED) return next();

    const current = await countFn(req);

    if (current >= limit) {
      // Soft rejim: faqat ogohlantirish, bloklamaymiz
      if (!env.ENFORCE_LIMITS) {
        logger.warn(
          { featureKey, current, limit },
          "Tarif limiti oshdi (soft rejim - bloklanmadi)",
        );
        return next();
      }
      return next(
        new ApiError(
          402, // Payment Required — tarifni oshirish kerak
          `Tarif limiti tugadi (${current}/${limit}). Tarifni oshiring.`,
          { code: "LIMIT_EXCEEDED", details: { featureKey, current, limit } },
        ),
      );
    }

    return next();
  } catch (err) {
    // Limit tekshiruvi o'zi yiqilsa foydalanuvchini bloklamaymiz —
    // bu bizning ichki muammomiz, mijoz aybdor emas.
    logger.error({ err: err.message, featureKey }, "Limit tekshiruvi xatosi");
    return next();
  }
};

/**
 * BOOLEAN imkoniyat yoqilganini tekshiradi (masalan "telegram_bot").
 * Tarifda yo'q bo'lsa 402 qaytaradi.
 */
export const requireFeature = (featureKey, label) => (req, _res, next) => {
  if (isFeatureEnabled(featureKey)) return next();
  return next(
    new ApiError(402, `${label || featureKey} tarifingizda mavjud emas`, {
      code: "FEATURE_NOT_AVAILABLE",
      details: { featureKey },
    }),
  );
};

export default enforceLimit;
