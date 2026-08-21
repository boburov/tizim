import { z } from 'zod';

/** `modules/feedbackTypes/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

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

export const createSchema = z.object({
  body: z.object({ name: z.string().min(1, 'Nom kerak').max(80) }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      name: z.string().min(1).max(80).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
