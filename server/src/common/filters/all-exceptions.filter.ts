import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ApiError } from '../errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `server/src/middleware/errorHandler.js` NING KO'CHIRMASI.
 *
 * Javob shakli AYNAN saqlanadi — klient shunga tayanadi:
 *     { success: false, message, code?, details? }
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * PRISMA XATO KODLARI → HTTP.
 *
 * Faqat MIJOZ tuzata oladigan xatolar bu yerda. Qolgan hamma narsa
 * (P1xxx ulanish, P2021 jadval yo'q, P2025 topilmadi...) ATAYLAB 500
 * bo'lib qoladi — ular kod yoki infratuzilma nosozligi va ularni 4xx
 * qilish muammoni yashirardi.
 */
const PRISMA_ERRORS: Record<string, { status: number; message: string; code: string }> = {
  P2002: { status: 409, message: 'Bunday yozuv allaqachon mavjud', code: 'DUPLICATE' },
  P2003: {
    status: 409,
    message: "Bog'langan yozuv mavjud - avval unga tegishli ma'lumotni o'chiring",
    code: 'FK_CONSTRAINT',
  },
  P2011: { status: 400, message: "Majburiy maydon to'ldirilmagan", code: 'NULL_CONSTRAINT' },
  P2012: { status: 400, message: 'Majburiy maydon yetishmayapti', code: 'MISSING_FIELD' },
  P2000: { status: 400, message: 'Qiymat maydon uchun juda uzun', code: 'VALUE_TOO_LONG' },
};

/** Postgres CHECK cheklovi (SQLSTATE 23514). */
const isCheckViolation = (err: any): boolean =>
  err?.meta?.code === '23514' ||
  err?.code === '23514' ||
  /violates check constraint/i.test(String(err?.message || ''));

/** Xato matnidan cheklov nomini ajratadi (audit uchun). */
const constraintNameOf = (err: any): { constraint: string } | undefined => {
  const raw = String(err?.meta?.message || err?.message || '');
  const m = raw.match(/violates check constraint "([^"]+)"/i);
  return m ? { constraint: m[1] } : undefined;
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly isProd: boolean) {}

  catch(err: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let statusCode = 500;
    let message = 'Serverda xatolik yuz berdi';
    let code: string | undefined;
    let details: unknown;

    const e = err as any;

    if (err instanceof ApiError) {
      statusCode = err.statusCode;
      message = err.message;
      code = err.code;
      details = err.details;
    } else if (err instanceof ZodError) {
      statusCode = 400;
      message = "Ma'lumotlar noto'g'ri";
      code = 'VALIDATION_ERROR';
      details = err.errors.map((x) => ({ path: x.path.join('.'), message: x.message }));
    } else if (PRISMA_ERRORS[e?.code]) {
      const mapped = PRISMA_ERRORS[e.code];
      statusCode = mapped.status;
      message = mapped.message;
      code = mapped.code;
    } else if (isCheckViolation(e)) {
      // Baza CHECK cheklovi. Bu 500 EMAS: yozuv biznes qoidasini buzdi,
      // ya'ni bu mijoz xatosi. Cheklov nomi `details` da qoladi.
      statusCode = 400;
      message = "Ma'lumot biznes qoidasini buzadi";
      code = 'CHECK_VIOLATION';
      details = constraintNameOf(e);
    } else if (err instanceof HttpException) {
      // NestJS'ning O'Z istisnolari (ValidationPipe, NotFoundException,
      // va `prisma.extensions.ts` dagi JOURNAL_IMMUTABLE).
      //
      // Tana ALLAQACHON `{ success, message, code }` shaklida bo'lsa —
      // o'sha holicha qaytariladi; aks holda shu shaklga keltiriladi.
      statusCode = err.getStatus();
      const body = err.getResponse() as any;
      if (body && typeof body === 'object') {
        message = body.message ?? err.message;
        code = body.code;
        details = body.details;
        if (Array.isArray(body.message)) {
          details = body.message;
          message = "Ma'lumotlar noto'g'ri";
          code = code ?? 'VALIDATION_ERROR';
        }
      } else {
        message = String(body ?? err.message);
      }
    }

    if (statusCode >= 500) {
      this.logger.error(
        `Unhandled error ${req?.method} ${req?.originalUrl}`,
        e?.stack ?? String(err),
      );
    }

    res.status(statusCode).json({
      success: false,
      message,
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
      ...(!this.isProd && e?.stack && statusCode >= 500 ? { stack: e.stack } : {}),
    });
  }
}
