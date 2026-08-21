/**
 * `server/src/utils/ApiError.js` NING AYNAN KO'CHIRMASI.
 *
 * NEGA NestJS'ning `HttpException` I ISHLATILMADI: 388 endpoint va 42 000
 * qator servis kodi `throw new ApiError(403, "...")` shaklida yozilgan.
 * Ularni `ForbiddenException` ga aylantirish har bir chaqiruvni qo'lda
 * o'zgartirishni talab qilardi — va aynan shu turdagi ommaviy tahrir
 * xavfsizlik mantig'ida xato tug'diradi.
 *
 * `AllExceptionsFilter` uni `HttpException` bilan bir xilda ishlaydi,
 * ya'ni NestJS bilan aralashib ketishi mumkin.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(
    statusCode: number,
    message: string,
    { code, details }: { code?: string; details?: unknown } = {},
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export default ApiError;
