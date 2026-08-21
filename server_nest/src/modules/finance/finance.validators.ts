import { z } from 'zod';

/**
 * Express `finance/validators/{groupFee,studentPayment,transaction,discount}
 * .validator.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ CHEGARALAR O'ZGARMAYDI. Ular shartnomaning bir qismi: `max(200)`
 * sahifa hajmi, `max(50_000_000)` bir martalik to'lov shifti,
 * `min(8)` idempotentlik kaliti uzunligi.
 */

// ───────────────────────────── GURUH TARIFI ─────────────────────────────

export const groupFeeListSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    search: z.string().trim().optional(),
  }),
});

export const groupFeeByGroupSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
});

export const groupFeeUpsertSchema = z.object({
  body: z.object({
    groupId: z.string({ required_error: 'Guruh kerak' }).min(1),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    amount: z.coerce.number().int().min(0, "Manfiy bo'lmasligi kerak"),
    // Tasdiq talab qilinganda so'rovchi qoldiradigan izoh (owner ko'radi).
    requestNote: z.string().trim().max(500).optional(),
  }),
});

// ──────────────────────────── O'QUVCHI TO'LOVI ───────────────────────────

export const paymentListSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(['unpaid', 'partial', 'paid']).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

export const paymentObligationsSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000),
    // Ixtiyoriy: berilmasa — tanlangan yilning BARCHA oylari bo'yicha.
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const paymentIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const paymentStudentIdParamSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
});

// ────────────────────────────── KIRIM (TX) ───────────────────────────────

export const transactionCreateSchema = z.object({
  body: z.object({
    paymentId: z.string({ required_error: "To'lov kerak" }).min(1),
    amount: z.coerce
      .number()
      .int()
      .positive("Summa musbat bo'lishi kerak")
      .max(50_000_000, "Summa 50 000 000 dan oshmasligi kerak"),
    method: z.enum(['cash', 'card'], { required_error: "To'lov turini tanlang" }),
    paidAt: z.string().optional(),
    note: z.string().trim().max(300).optional(),
    // Double-click/retry himoyasi uchun klient yaratadigan takrorlanmas kalit.
    idempotencyKey: z.string().trim().min(8).max(100).optional(),
  }),
});

export const transactionIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// ─────────────────────────────── CHEGIRMA ────────────────────────────────

export const discountListSchema = z.object({
  query: z.object({
    studentId: z.string().optional(),
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

export const discountCreateSchema = z.object({
  body: z.object({
    student: z.string({ required_error: "O'quvchi kerak" }).min(1),
    group: z.string({ required_error: 'Guruh kerak' }).min(1),
    type: z.enum(['fixed', 'percent'], { required_error: 'Chegirma turi kerak' }),
    value: z.coerce.number().min(0, "Manfiy bo'lmasligi kerak"),
    scope: z.enum(['permanent', 'monthly'], {
      required_error: 'Amal qilish doirasi kerak',
    }),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    reason: z.string().trim().max(300).optional(),
    requestNote: z.string().trim().max(500).optional(),
  }),
});

export const discountUpdateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    type: z.enum(['fixed', 'percent']).optional(),
    value: z.coerce.number().min(0).optional(),
    scope: z.enum(['permanent', 'monthly']).optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    reason: z.string().trim().max(300).optional(),
    requestNote: z.string().trim().max(500).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const discountIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type GroupFeeListRequest = z.infer<typeof groupFeeListSchema>;
export type GroupFeeByGroupRequest = z.infer<typeof groupFeeByGroupSchema>;
export type GroupFeeUpsertRequest = z.infer<typeof groupFeeUpsertSchema>;
export type PaymentListRequest = z.infer<typeof paymentListSchema>;
export type PaymentObligationsRequest = z.infer<typeof paymentObligationsSchema>;
export type PaymentIdParamRequest = z.infer<typeof paymentIdParamSchema>;
export type PaymentStudentIdParamRequest = z.infer<typeof paymentStudentIdParamSchema>;
export type TransactionCreateRequest = z.infer<typeof transactionCreateSchema>;
export type TransactionIdParamRequest = z.infer<typeof transactionIdParamSchema>;
export type DiscountListRequest = z.infer<typeof discountListSchema>;
export type DiscountCreateRequest = z.infer<typeof discountCreateSchema>;
export type DiscountUpdateRequest = z.infer<typeof discountUpdateSchema>;
export type DiscountIdParamRequest = z.infer<typeof discountIdParamSchema>;
