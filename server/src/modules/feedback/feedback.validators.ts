import { z } from 'zod';

/** `modules/feedback/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    type: z.string().optional(),
    status: z.enum(['new', 'in_review', 'resolved', 'rejected']).optional(),
    search: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const myListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const submitSchema = z.object({
  body: z.object({
    type: z.string().min(1, 'Tur kerak'),
    group: z.string().nullable().optional(),
    message: z
      .string()
      .min(5, "Matn kamida 5 belgidan iborat bo'lishi kerak")
      .max(2000),
    isAnonymous: z.boolean().optional(),
  }),
});

export const replySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ message: z.string().min(1, 'Javob matni kerak').max(2000) }),
});

export const resolveSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  // ⚠ `.default({})` — tanasiz `POST` ham qabul qilinadi (javobsiz
  // "hal qilindi" belgilash mumkin).
  body: z.object({ adminReply: z.string().max(2000).optional() }).default({}),
});

export const rejectSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ rejectionReason: z.string().min(1, 'Sabab kerak').max(500) }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type MyListRequest = z.infer<typeof myListSchema>;
export type SubmitRequest = z.infer<typeof submitSchema>;
export type ReplyRequest = z.infer<typeof replySchema>;
export type ResolveRequest = z.infer<typeof resolveSchema>;
export type RejectRequest = z.infer<typeof rejectSchema>;
export type RangeRequest = z.infer<typeof rangeSchema>;
