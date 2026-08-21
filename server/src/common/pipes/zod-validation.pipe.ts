import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * `server/src/middleware/validate.js` NING EKVIVALENTI.
 *
 * ── NEGA class-validator EMAS ──
 * 388 endpoint ~120 ta zod sxemasi bilan qo'riqlanadi va ularning xato
 * shakli KLIENT SHARTNOMASI:
 *     { code: "VALIDATION_ERROR", details: [{ path, message }] }
 * class-validator ga o'tkazish har bir sxemani qayta yozishni talab
 * qilardi va xato shaklini o'zgartirardi — ya'ni foyda nolga teng,
 * xavf esa yuqori. Mavjud sxemalar SHU HOLICHA qayta ishlatiladi.
 *
 * ── EXPRESS BILAN FARQI ──
 * Express `validate()` butun `{ body, query, params }` ni bitta sxemaga
 * beradi va natijani `req` ga QAYTA YOZADI. NestJS pipe'lari esa har bir
 * argumentni alohida oladi, shuning uchun bu yerda ikkala shakl ham
 * qo'llab-quvvatlanadi:
 *
 *   • `@Body(new ZodValidationPipe(schema.shape.body))` — bo'lak sxema;
 *   • kontrollerda `@UsePipes(new ZodRequestPipe(schema))` — butun sxema
 *     (mavjud validatorlarni O'ZGARTIRMASDAN ishlatish uchun).
 *
 * Xato ATAYLAB `ZodError` sifatida qayta tashlanadi — uni
 * `AllExceptionsFilter` Express'dagi bilan bir xil formatga soladi,
 * ya'ni format bitta joyda hal qilinadi.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    // `parse` xato bo'lsa ZodError tashlaydi — filtr uni tutadi.
    return this.schema.parse(value);
  }
}

/**
 * Butun so'rovni (`{ body, query, params }`) mavjud zod sxemasi bilan
 * tekshiradi — Express `validate()` bilan AYNAN bir xil shakl.
 */
@Injectable()
export class ZodRequestPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type !== 'custom') return value;
    return this.schema.parse(value);
  }
}
