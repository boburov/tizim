import { z } from 'zod';

/** `ledger/validators/*.js` KO'CHIRMASI. */
export const statementSchema = z.object({
  params: z.object({
    userId: z.string().length(24, "Foydalanuvchi noto'g'ri"),
  }),
  query: z.object({
    // ⚠ Oraliq FAQAT KO'RSATISHNI cheklaydi — balans baribir TO'LIQ
    // tarixdan hisoblanadi (`statementFor` → `visible`).
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export type StatementRequest = z.infer<typeof statementSchema>;
