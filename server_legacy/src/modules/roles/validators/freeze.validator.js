import { z } from "zod";

export const freezeSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  body: z.object({
    isFrozen: z.boolean(),
    // Muzlatish sababi - login rad etilganda foydalanuvchiga ko'rsatiladi.
    reason: z.string().max(300).optional(),
  }),
});
