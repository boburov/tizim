import { z } from 'zod';

/** `modules/systemNotifications/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    status: z.enum(['all', 'read', 'unread']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const createSchema = z.object({
  body: z.object({
    message: z.string().min(1, 'Bildirishnoma matni kerak').max(1000),
    link: z.string().max(500).nullable().optional(),
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
