import { z } from 'zod';

/** `modules/activityLogs/validators/list.validator.js` NING AYNAN KO'CHIRMASI. */

export const listSchema = z.object({
  query: z.object({
    userId: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional(),
    action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT']).optional(),
    resourceType: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    // ⚠ Chegara 500 — umumiy `parsePagination` bilan BIR XIL.
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type IdRequest = z.infer<typeof idSchema>;
export type RangeRequest = z.infer<typeof rangeSchema>;
