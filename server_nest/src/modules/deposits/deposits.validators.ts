import { z } from 'zod';

/**
 * `deposits/validators/deposit.validator.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ CHEGARALAR O'ZGARMAYDI: `min(1)` — nol yoki manfiy summa
 * "tranzaksiya" bo'la olmaydi; `max(50_000_000)` — barmoq xatosidan
 * himoya (50 mln dan katta depozit real emas). Ularni kengaytirish
 * moliyaviy shartnomani o'zgartirish bo'lardi.
 */
const money = z.coerce.number().int().min(1).max(50_000_000);
const method = z.enum(['cash', 'card']).optional();

export const topupSchema = z.object({
  body: z.object({
    studentId: z.string().min(1, "O'quvchi kerak"),
    amount: money,
    method,
    paidAt: z.coerce.date().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

/** ⚠ Express'da `withdrawSchema = topupSchema` — AYNAN bir xil obyekt. */
export const withdrawSchema = topupSchema;

export const applySchema = z.object({
  body: z.object({ studentId: z.string().min(1, "O'quvchi kerak") }),
});

export const studentIdParamSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    studentId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    type: z.enum(['topup', 'withdraw', 'refund']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const reportSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export type TopupRequest = z.infer<typeof topupSchema>;
export type WithdrawRequest = z.infer<typeof withdrawSchema>;
export type ApplyRequest = z.infer<typeof applySchema>;
export type StudentIdParamRequest = z.infer<typeof studentIdParamSchema>;
export type IdParamRequest = z.infer<typeof idParamSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type ReportRequest = z.infer<typeof reportSchema>;
