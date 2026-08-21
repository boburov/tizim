import { z } from "zod";

export const valueSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
});

export const removeSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  query: z.object({
    // Rolda foydalanuvchi bo'lsa - ularni qaysi rolga ko'chirish kerakligi.
    migrateTo: z.string().min(1).optional(),
  }),
});
