import { z } from "zod";

export const priceListSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const setPriceSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // null / berilmagan = BAZAVIY narx (barcha filiallar uchun).
    branchId: z.union([z.string().min(1), z.null()]).optional(),
    amount: z.coerce.number().int().min(0).max(1_000_000_000),
    validFrom: z.coerce.date().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const clearPriceSchema = z.object({
  params: z.object({ id: z.string().min(1), branchId: z.string().min(1) }),
});

export const resolveSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});
