import { z } from 'zod';

/** `modules/activityHistory/validators/list.validator.js` NING KO'CHIRMASI. */

export const studentTimelineSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    // ⚠ Chegara 200 (umumiy `parsePagination` dagi 500 EMAS).
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const groupTimelineSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export type StudentTimelineRequest = z.infer<typeof studentTimelineSchema>;
export type GroupTimelineRequest = z.infer<typeof groupTimelineSchema>;
