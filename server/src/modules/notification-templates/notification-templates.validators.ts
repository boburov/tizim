import { z } from 'zod';

/** `modules/notificationTemplates/validators/*.js` NING AYNAN KO'CHIRMASI. */

const CATEGORIES = [
  'payment',
  'debt',
  'class_cancel',
  'announcement',
  'holiday',
  'personal',
  'feedback_status',
  'custom',
] as const;

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: z.enum(CATEGORIES).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Nom kerak').max(120),
    body: z.string().min(1, 'Matn kerak').max(2000),
    category: z.enum(CATEGORIES).optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      body: z.string().min(1).max(2000).optional(),
      category: z.enum(CATEGORIES).optional(),
      isActive: z.boolean().optional(),
    })
    // ⚠ BO'SH TANA 400 BERADI. Bu shunchaki qulaylik emas: bo'sh
    // `PATCH` jimgina 200 qaytarib hech narsa o'zgartirmasdi va
    // foydalanuvchi "saqlandi" deb o'ylardi.
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
