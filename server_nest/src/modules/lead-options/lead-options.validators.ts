import { z } from 'zod';
import { LEAD_OPTION_KINDS } from '../../common/constants/lead-status.js';

/** `modules/leadOptions/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const listSchema = z.object({
  query: z.object({
    kind: z.enum(LEAD_OPTION_KINDS).optional(),
    search: z.string().optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const createSchema = z.object({
  body: z.object({
    kind: z.enum(LEAD_OPTION_KINDS),
    name: z.string().min(1, 'Nom kerak').max(120),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      isActive: z.boolean().optional(),
    })
    // ⚠ Bo'sh `PATCH` jimgina 200 qaytarib hech narsa o'zgartirmasdi.
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
