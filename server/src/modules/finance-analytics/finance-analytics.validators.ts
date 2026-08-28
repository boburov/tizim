import { z } from 'zod';

/**
 * TAHLIL FILTRLARI — barcha endpoint uchun UMUMIY shakl.
 * (`validators/analytics.validator.js` NING KO'CHIRMASI)
 *
 * Hammasi IXTIYORIY: berilmasa joriy oy olinadi. Talab shuni aytadi —
 * "Do not force irrelevant filters".
 *
 * `.optional()` va `coerce`: query parametrlari HAR DOIM satr bo'lib
 * keladi, shuning uchun son/sana konvertatsiyasi shu yerda.
 */
const id = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID formati noto'g'ri");

export const analyticsFilterSchema = z.object({
  query: z.object({
    from: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .optional(),
    to: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),

    branchId: id.optional(),
    teacherId: id.optional(),
    courseId: id.optional(),
    groupId: id.optional(),
    roomId: id.optional(),
    studentId: id.optional(),
    expenseCategoryId: id.optional(),

    paymentMethod: z
      .enum(['cash', 'card', 'click', 'payme', 'uzcard', 'humo', 'bank', 'transfer'])
      .optional(),
    costType: z.enum(['fixed', 'variable']).optional(),
    accountKind: z
      .enum([
        'cash',
        'terminal',
        'click',
        'payme',
        'bank',
        'transit',
        'uzcard',
        'humo',
        'other',
      ])
      .optional(),

    granularity: z.enum(['day', 'week', 'month']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

/** Kesim (breakdown) tanlovi — faqat ruxsat etilgan qiymatlar. */
export const breakdownSchema = z.object({
  params: z.object({
    // `student` — zanjirning eng chuqur bo'g'ini (talab 34):
    // guruh daromadini bosgan odam KIM TO'LAGANINI ko'radi.
    by: z.enum(['branch', 'course', 'teacher', 'group', 'room', 'method', 'student']),
  }),
  query: analyticsFilterSchema.shape.query,
});

/**
 * CHIQIM KESIMI — "pul qayerga ketdi" zanjiri uchun.
 *
 * `person` va `teacher` MAOSH tannarxini odam bo'yicha ochadi, shuning
 * uchun kontrollerda qo'shimcha ruxsat tekshiruvi bor.
 */
export const expenseBreakdownSchema = z.object({
  params: z.object({
    by: z.enum(['category', 'person', 'teacher', 'branch', 'group', 'costType']),
  }),
  query: analyticsFilterSchema.shape.query,
});

/** Bitta o'quvchining moliyaviy yo'li. */
export const studentIdSchema = z.object({
  params: z.object({ id }),
  query: analyticsFilterSchema.shape.query,
});

export const receivablesBreakdownSchema = z.object({
  params: z.object({ by: z.enum(['branch', 'course', 'group', 'student']) }),
  query: analyticsFilterSchema.shape.query,
});

/** Bitta jurnal yozuvi tafsiloti. */
export const entryIdSchema = z.object({
  params: z.object({ id: id }),
});

/**
 * KVITANSIYA KALITI — `JournalEntry.postingKey`.
 *
 * Shakl: `<tur>:<manba id>`, ba'zan uch bo'lakli
 * (`storno:expense:<id>`, `expense:<id>:v2`). Shuning uchun `id`
 * validatori (24 hex) BU YERGA TO'G'RI KELMAYDI.
 *
 * Regex ochiq emas: faqat kichik harf/raqam/`_`/`:`/`.`/`-`. Uzunlik
 * cheklangan — kalit unique indeksga tushadi, ya'ni uzun satr
 * skanerlashga sabab bo'lmaydi.
 */
export const entryPostingKeySchema = z.object({
  params: z.object({
    key: z
      .string()
      .min(3)
      .max(128)
      .regex(/^[a-z_]+:[A-Za-z0-9_:.-]+$/, "Kvitansiya kaliti formati noto'g'ri"),
  }),
});

/** Intellekt signali — ID `type` yoki `type:entityId` shaklida. */
export const alertIdSchema = z.object({
  params: z.object({
    alertId: z
      .string()
      .regex(/^[a-z_]+(:[0-9a-fA-F]{24})?$/, "Signal ID formati noto'g'ri"),
  }),
  query: analyticsFilterSchema.shape.query.extend({
    explain: z.enum(['true', 'false']).optional(),
  }),
});
