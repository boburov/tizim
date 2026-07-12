import { z } from "zod";

export const studentTimelineSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
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
