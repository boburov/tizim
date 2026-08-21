import { z } from 'zod';

/**
 * `modules/courses/validators/*.js` NING AYNAN KO'CHIRMASI.
 * Sxemalar butun so'rovni (`{ body, query, params }`) o'raydi — xato
 * yo'li (`details[].path`) Express bilan bir xil chiqishi uchun.
 */

// Kod BARQAROR mashina kaliti: hisobot va AI qoidalari unga tayanadi,
// shuning uchun format modeldagi bilan AYNAN bir xil cheklanadi.
const code = z
  .string()
  .trim()
  .min(2, 'Kod kamida 2 belgi')
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, 'Kod faqat lotin harfi, raqam, - va _ dan iborat');

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, 'Kurs nomi kerak').max(120),
    code,
    level: z.string().trim().max(30).optional(),
    defaultDurationMonths: z
      .union([z.coerce.number().int().min(0).max(120), z.null()])
      .optional(),
    leadDirection: z.union([z.string().min(1), z.null()]).optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/, 'Kod faqat lotin harfi, raqam, - va _ dan iborat')
      .optional(),
    level: z.string().trim().max(30).optional(),
    defaultDurationMonths: z
      .union([z.coerce.number().int().min(0).max(120), z.null()])
      .optional(),
    leadDirection: z.union([z.string().min(1), z.null()]).optional(),
    isActive: z.boolean().optional(),
  }),
});

// ── NARX MATRITSASI ──

export const priceListSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const setPriceSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // null / berilmagan = BAZAVIY narx (barcha filiallar uchun).
    branchId: z.union([z.string().min(1), z.null()]).optional(),
    amount: z.coerce.number().int().min(0).max(1_000_000_000),
    validFrom: z.coerce.date().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const clearPriceSchema = z.object({
  params: z.object({ id: z.string().min(1), branchId: z.string().min(1) }),
});

export const resolveSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type IdRequest = z.infer<typeof idSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type PriceListRequest = z.infer<typeof priceListSchema>;
export type SetPriceRequest = z.infer<typeof setPriceSchema>;
export type ClearPriceRequest = z.infer<typeof clearPriceSchema>;
export type ResolveRequest = z.infer<typeof resolveSchema>;
