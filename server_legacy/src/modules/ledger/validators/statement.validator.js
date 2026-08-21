import { z } from "zod";

export const statementSchema = z.object({
  params: z.object({
    userId: z.string().length(24, "Foydalanuvchi noto'g'ri"),
  }),
  query: z.object({
    // Oraliq FAQAT ko'rsatishni cheklaydi - balans baribir TO'LIQ
    // tarixdan hisoblanadi (qarang ledger.service.js -> visible).
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});
