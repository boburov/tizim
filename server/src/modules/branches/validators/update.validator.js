import { z } from "zod";

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    isActive: z.boolean().optional(),
    // Chiqim limiti: null/0 = cheksiz
    expenseApprovalThreshold: z
      .union([z.coerce.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
  }),
});
