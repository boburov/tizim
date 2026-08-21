import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[a-zA-Z0-9_-]+$/, "Kod faqat lotin harfi, raqam, - va _ dan iborat")
      .optional(),
    level: z.string().trim().max(30).optional(),
    defaultDurationMonths: z
      .union([z.coerce.number().int().min(0).max(120), z.null()])
      .optional(),
    leadDirection: z.union([z.string().min(1), z.null()]).optional(),
    isActive: z.boolean().optional(),
  }),
});
