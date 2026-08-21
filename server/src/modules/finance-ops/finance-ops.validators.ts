// ⚠ `server/src/modules/financeOps/validators/financeOps.validator.js`
// DAN AYNAN KO'CHIRILGAN. Chegaralar va xato matnlari o'zgartirilmasin —
// ular `details[].path`/`message` bilan birga klient shartnomasi.
import { z } from 'zod';
import { PAYMENT_METHODS } from '../../common/constants/treasury.js';

const id = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID formati noto'g'ri");
// Pul: BUTUN SO'M. Kasr qabul qilinmaydi — kassa tiyin bilan ishlamaydi.
const money = z.coerce.number().int().positive("Summa musbat bo'lishi kerak")
  .max(1_000_000_000, "Summa juda katta");
const method = z.enum(PAYMENT_METHODS as unknown as [string, ...string[]]);
const idem = z.string().trim().min(8).max(100).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Sana YYYY-MM-DD").optional();

export const refundSchema = z.object({
  body: z.object({
    studentId: id,
    groupId: id.optional(),
    originalTransactionId: id.optional(),
    amount: money,
    method,
    reason: z.string().trim().min(3, "Sabab ko'rsatilishi shart").max(300),
    date: day,
    idempotencyKey: idem,
  }),
});

export const transferSchema = z.object({
  body: z.object({
    branchId: id.optional(),
    fromMethod: method,
    toMethod: method,
    amount: money,
    memo: z.string().trim().max(300).optional(),
    date: day,
    idempotencyKey: idem,
  }).refine((b) => b.fromMethod !== b.toMethod, {
    message: "Jo'natuvchi va qabul qiluvchi hisob bir xil bo'lmasligi kerak",
    path: ["toMethod"],
  }),
});

export const ownerCapitalSchema = z.object({
  body: z.object({
    direction: z.enum(["investment", "withdrawal"]),
    branchId: id.optional(),
    amount: money,
    method,
    memo: z.string().trim().max(300).optional(),
    date: day,
    idempotencyKey: idem,
  }),
});

// ── BYUDJET ──
//
// Summa BUTUN so'm va NOL bo'lishi mumkin: "marketingga 0 ajratildi"
// — haqiqiy reja qarori, xato emas. Shuning uchun `nonnegative`,
// `positive` emas.
const budgetAmount = z.coerce.number().int().nonnegative().max(100_000_000_000);

const budgetLine = z.object({
  scope: z.enum(["total", "category", "kind"]).default("category"),
  categoryId: id.optional().nullable(),
  categoryKind: z.enum(["operating", "payroll", "tax", "capital"]).optional().nullable(),
  amount: budgetAmount,
  note: z.string().trim().max(300).optional(),
});

export const budgetCreateSchema = z.object({
  body: z.object({
    name: z.string().trim().max(120).optional(),
    branchId: id.optional().nullable(),
    periodType: z.enum(["month", "quarter", "year"]).default("month"),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12).optional(),
    quarter: z.coerce.number().int().min(1).max(4).optional(),
    status: z.enum(["draft", "active", "closed"]).optional(),
    note: z.string().trim().max(500).optional(),
    lines: z.array(budgetLine).max(60).optional(),
  }),
});

export const budgetUpdateSchema = z.object({
  params: z.object({ id }),
  body: z.object({
    name: z.string().trim().max(120).optional(),
    status: z.enum(["draft", "active", "closed"]).optional(),
    note: z.string().trim().max(500).optional(),
    lines: z.array(budgetLine).max(60).optional(),
  }),
});

export const budgetIdSchema = z.object({ params: z.object({ id }) });

export const budgetListSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    branchId: id.optional(),
  }),
});

export type RefundRequest = z.infer<typeof refundSchema>;
export type TransferRequest = z.infer<typeof transferSchema>;
export type OwnerCapitalRequest = z.infer<typeof ownerCapitalSchema>;
export type BudgetCreateRequest = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateRequest = z.infer<typeof budgetUpdateSchema>;
export type BudgetIdRequest = z.infer<typeof budgetIdSchema>;
export type BudgetListRequest = z.infer<typeof budgetListSchema>;
