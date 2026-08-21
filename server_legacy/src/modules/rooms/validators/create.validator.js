import { z } from "zod";

const shared = {
  capacity: z.union([z.coerce.number().int().min(0).max(1000), z.null()]).optional(),
  // Maydon kasrli bo'lishi mumkin (18.5 kv.m).
  areaM2: z.union([z.coerce.number().min(0).max(100000), z.null()]).optional(),
  equipment: z.array(z.string().trim().max(60)).max(30).optional(),
  note: z.string().trim().max(300).optional(),
};

export const createSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, "Xona nomi kerak").max(80),
    // "Barcha filiallar" rejimida formada ochiq tanlanadi. Ko'lam
    // tekshiruvi servisda (resolveBranchForWrite).
    branchId: z.string().min(1).optional(),
    ...shared,
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    branchId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    ...shared,
  }),
});
