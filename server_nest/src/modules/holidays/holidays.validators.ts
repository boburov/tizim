import { z } from 'zod';

/** `modules/holidays/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    audience: z.enum(['all', 'students', 'teachers']).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    includePast: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const createSchema = z.object({
  body: z
    .object({
      name: z.string().min(1, 'Nom kerak').max(120),
      isRecurring: z.boolean().optional(),
      month: z.coerce.number().int().min(1).max(12),
      day: z.coerce.number().int().min(1).max(31),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      message: z.string().min(1, 'Tabrik matni kerak').max(2000),
      audience: z.enum(['all', 'students', 'teachers']).optional(),
    })
    // ⚠ BIR MARTALIK BAYRAMDA YIL MAJBURIY. Aks holda yozuv "hech qachon
    // kelmaydigan" bayram bo'lib qolardi (`year: null` + `isRecurring:
    // false` — hech bir yilga to'g'ri kelmaydi).
    .superRefine((b, ctx) => {
      const isRecurring = b.isRecurring !== false;
      if (!isRecurring && !b.year) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['year'],
          message: 'Bir martalik bayram uchun yil kerak',
        });
      }
    }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      isRecurring: z.boolean().optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
      day: z.coerce.number().int().min(1).max(31).optional(),
      year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
      message: z.string().min(1).max(2000).optional(),
      audience: z.enum(['all', 'students', 'teachers']).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const congratulateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Yetkazish kanallari: "telegram" (bot orqali), "inapp" (platforma).
    channels: z
      .array(z.enum(['inapp', 'telegram']))
      .min(1, 'Kamida bitta kanal tanlang'),
    // Ixtiyoriy — berilmasa standart tabrik matni ishlatiladi.
    message: z.string().max(2000).optional(),
    title: z.string().max(200).optional(),
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type CongratulateRequest = z.infer<typeof congratulateSchema>;
