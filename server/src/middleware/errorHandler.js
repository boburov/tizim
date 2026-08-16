import { ZodError } from "zod";
import mongoose from "mongoose";
import ApiError from "../utils/ApiError.js";
import logger from "../config/logger.js";
import { isProd } from "../config/env.js";
import { isMongoUnavailable } from "../config/legacyMongoose.js";

/**
 * PRISMA XATO KODLARI -> HTTP.
 *
 * Faqat MIJOZ tuzata oladigan xatolar bu yerda. Qolgan hamma narsa
 * (P1xxx ulanish, P2021 jadval yo'q, P2025 topilmadi...) ATAYLAB
 * 500 bo'lib qoladi - ular kod yoki infratuzilma nosozligi va
 * ularni 4xx qilish muammoni yashirardi.
 */
const PRISMA_ERRORS = {
  // Unique cheklov - Mongo'dagi 11000 ning aynan o'zi.
  P2002: { status: 409, message: "Bunday yozuv allaqachon mavjud", code: "DUPLICATE" },
  // Tashqi kalit: bog'langan yozuv yo'q yoki hali bog'liq yozuvlar bor.
  // Postgres FK'lari RESTRICT, ya'ni bu ko'pincha "avval bolalarini
  // o'chiring" degani - 500 emas, mijozga tushunarli 409.
  P2003: { status: 409, message: "Bog'langan yozuv mavjud - avval unga tegishli ma'lumotni o'chiring", code: "FK_CONSTRAINT" },
  // NOT NULL ustuniga null yozildi.
  P2011: { status: 400, message: "Majburiy maydon to'ldirilmagan", code: "NULL_CONSTRAINT" },
  P2012: { status: 400, message: "Majburiy maydon yetishmayapti", code: "MISSING_FIELD" },
  // Qiymat ustunga sig'madi (masalan 24 belgidan uzun ID).
  P2000: { status: 400, message: "Qiymat maydon uchun juda uzun", code: "VALUE_TOO_LONG" },
};

/** Postgres CHECK cheklovi (SQLSTATE 23514). */
const isCheckViolation = (err) =>
  err?.meta?.code === "23514" ||
  err?.code === "23514" ||
  /violates check constraint/i.test(String(err?.message || ""));

/** Xato matnidan cheklov nomini ajratadi (audit uchun). */
const constraintNameOf = (err) => {
  const raw = String(err?.meta?.message || err?.message || "");
  const m = raw.match(/violates check constraint "([^"]+)"/i);
  return m ? { constraint: m[1] } : undefined;
};

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
  } else if (PRISMA_ERRORS[err?.code]) {
    // ═══════════════════════════════════════════════════════════════
    // PRISMA XATOLARI - ilgari BUTUNLAY moslanmagan edi.
    //
    // Mongo davrida `11000` -> 409 mapping'i bor edi, lekin uning
    // Prisma ekvivalenti (`P2002`) hech qayerda tutilmasdi. Natijada
    // "bu nomli kategoriya allaqachon mavjud" degan ODDIY holat
    // foydalanuvchiga `500 Serverda xatolik yuz berdi` bo'lib
    // chiqardi - va u nima qilishni bilmasdi.
    //
    // Servislar bu xatolarni O'ZLARI ham tutadi (aniqroq matn bilan),
    // bu esa ZAXIRA: tutilmagan joyda ham javob MA'NOLI bo'ladi.
    // ═══════════════════════════════════════════════════════════════
    const mapped = PRISMA_ERRORS[err.code];
    statusCode = mapped.status;
    message = mapped.message;
    code = mapped.code;
  } else if (isCheckViolation(err)) {
    // Baza CHECK cheklovi (`20260816090000_validation_invariants` va
    // boshqalar). Bu 500 EMAS: yozuv biznes qoidasini buzdi, ya'ni
    // bu mijoz xatosi. Cheklov nomi `details` da qoladi - u
    // qo'llab-quvvatlashga aynan qaysi qoida buzilganini aytadi.
    statusCode = 400;
    message = "Ma'lumot biznes qoidasini buzadi";
    code = "CHECK_VIOLATION";
    details = constraintNameOf(err);
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
