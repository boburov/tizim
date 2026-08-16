import { ZodError } from "zod";
import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { isProd } from "../config/env.js";
import { isMongoUnavailable } from "../config/legacyMongoose.js";

// Central error handler - every error funnels through here
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let message = "Serverda xatolik yuz berdi";
  let code;
  let details;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = "Ma'lumotlar noto'g'ri";
    code = "VALIDATION_ERROR";
    details = err.errors.map((e) => ({ path: e.path.join("."), message: e.message }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = "Ma'lumotlar noto'g'ri";
    code = "VALIDATION_ERROR";
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = "Noto'g'ri ID";
    code = "BAD_OBJECT_ID";
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = "Bunday yozuv allaqachon mavjud";
    code = "DUPLICATE";
    details = err.keyValue;
  } else if (isMongoUnavailable(err)) {
    // ═══════════════════════════════════════════════════════════════
    // 501 NOT IMPLEMENTED - "bu modul hali ko'chirilmagan".
    //
    // 500 EMAS. Farq mijoz uchun hal qiluvchi:
    //   500 = server buzilgan, qayta urinib ko'ring, xabar bering
    //   501 = server sog'lom, bu imkoniyat hali mavjud emas
    //
    // Rahbariyat paneli shu farqqa tayanadi: 501 "Manba ulanmagan"
    // degan xotirjam holatni ko'rsatadi, 500 esa qizil xato beradi.
    // Ikkalasini aralashtirish foydalanuvchini yo'q muammoni
    // tekshirishga majbur qilardi.
    //
    // Modul Prisma'ga ko'chgach bu shox O'Z-O'ZIDAN ishlamay qoladi:
    // Mongoose chaqiruvi yo'qolsa, xato ham yo'qoladi.
    // ═══════════════════════════════════════════════════════════════
    statusCode = 501;
    message = "Bu bo'lim PostgreSQL'ga hali ko'chirilmagan";
    code = "MODULE_NOT_MIGRATED";
  }

  // 501 - KUTILGAN holat, xato emas. `error` darajasida yozilsa
  // ko'chirish tugagunicha loglar shovqinga to'lardi va HAQIQIY
  // xatolar ko'rinmay qolardi.
  if (statusCode === 501) {
    logger.warn({ url: req.originalUrl }, "Ko'chirilmagan modul so'raldi");
  } else if (statusCode >= 500) {
    logger.error({ err, url: req.originalUrl }, "Unhandled error");
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(code && { code }),
    ...(details && { details }),
    ...(!isProd && err.stack && statusCode >= 500 && { stack: err.stack }),
  });
};

export default errorHandler;
