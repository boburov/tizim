import { z } from "zod";

export const routingCreateSchema = z.object({
  body: z.object({
    branchId: z.string().min(1),
    // Zaxira qoidada manba BO'LMAYDI - model buni tekshiradi.
    sourceKey: z.string().trim().max(80).optional().nullable(),
    isFallback: z.boolean().optional(),
    assigneeId: z.union([z.string().min(1), z.null()]).optional(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const routingUpdateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    branchId: z.string().min(1).optional(),
    assigneeId: z.union([z.string().min(1), z.null()]).optional(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const routingIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});
