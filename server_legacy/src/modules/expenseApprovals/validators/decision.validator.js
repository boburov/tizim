import { z } from "zod";

export const decisionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ note: z.string().max(500).optional() }).optional(),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
