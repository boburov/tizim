import { z } from 'zod';

/** `modules/search/validators/*.js` NING AYNAN KO'CHIRMASI. */
export const searchSchema = z.object({
  query: z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
});

export type SearchRequest = z.infer<typeof searchSchema>;
