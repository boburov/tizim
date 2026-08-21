import { z } from 'zod';
import {
  COMP_BASE_TYPES,
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from '../../common/constants/compensation.js';

/**
 * `modules/teacherSalary/validators/*.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ ENUM RO'YXATLARI KONSTANTALARDAN olinadi — ikki joyda saqlansa vaqt
 * o'tib ajralib ketardi (modelga yangi tur qo'shilib, validator uni
 * RAD ETARDI).
 */

const objectId = z.string().min(1);
const money = z.coerce.number().int().min(0).max(1_000_000_000);

// ─────────────────────── MAOSH (o'qish) ───────────────────────

export const salaryListSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    teacherId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    status: z.enum(['unpaid', 'partial', 'paid']).optional(),
    kind: z.enum(['group', 'base', 'bonus', 'deduction']).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(300).default(200),
  }),
});

export const salaryIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const salaryTeacherIdSchema = z.object({
  params: z.object({ teacherId: z.string().min(1) }),
});

export const obligationsSchema = z.object({
  query: z.object({
    groupId: z.string().optional(),
    year: z.coerce.number().int().min(2000).max(3000),
    // Ixtiyoriy: berilmasa — tanlangan yilning BARCHA oylari bo'yicha.
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

// ─────────────────────── MAOSH TO'LOVI ───────────────────────

export const transactionCreateSchema = z.object({
  body: z.object({
    salaryId: z.string({ required_error: 'Maosh kerak' }).min(1),
    amount: z.coerce.number().int().positive("Summa musbat bo'lishi kerak"),
    method: z.enum(['cash', 'card'], { required_error: "To'lov turini tanlang" }),
    paidAt: z.string().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const transactionIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// ─────────────────────── STAVKA ───────────────────────

const baseFields = {
  effectiveFrom: z.coerce.date().optional(),
  baseType: z.enum(COMP_BASE_TYPES as unknown as [string, ...string[]]).optional(),
  baseAmount: money.optional(),
  variableType: z
    .enum(COMP_VARIABLE_TYPES as unknown as [string, ...string[]])
    .optional(),
  // ⚠ `percent` uchun 0–100, qolganlari uchun SO'M — chegara `refine` bilan.
  variableRate: z.coerce.number().min(0).max(1_000_000_000).optional(),
  percentBase: z
    .enum(COMP_PERCENT_BASES as unknown as [string, ...string[]])
    .optional(),
  branchId: objectId.nullable().optional(),
  note: z.string().trim().max(500).optional(),
  requestNote: z.string().trim().max(500).optional(),
};

/**
 * ⚠ Foiz turida stavka 100 dan oshmasligi kerak — modeldagi
 * tekshiruvning AYNAN o'zi, lekin bu yerda foydalanuvchi 400
 * (validatsiya) xatosini oladi.
 */
const percentGuard = (data: Record<string, any>) =>
  data.variableType !== 'percent' || (data.variableRate ?? 0) <= 100;
const percentMsg = {
  message: "Foiz stavkasi 100 dan oshmasligi kerak",
  path: ['variableRate'],
};

export const compensationSetSchema = z.object({
  body: z.object({ teacher: objectId, ...baseFields }).refine(percentGuard, percentMsg),
});

export const compensationAmendSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object(baseFields).refine(percentGuard, percentMsg),
});

export const compensationIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export const compensationTeacherIdSchema = z.object({
  params: z.object({ teacherId: objectId }),
});

// ─────────────────────── MUKOFOT / JARIMA ───────────────────────

export const adjustmentCreateSchema = z.object({
  body: z.object({
    teacher: objectId,
    group: objectId.optional(),
    branchId: objectId.optional(),
    kind: z.enum(['bonus', 'deduction']).default('bonus'),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    amount: z.coerce.number().int().positive().max(1_000_000_000),
    reason: z.string().trim().min(1).max(500),
  }),
});

/**
 * HISOB-KITOBNI YOPISH.
 *
 * ⚠ SUMMA ATAYLAB SO'RALMAYDI: u SERVERDA qoldiqdan hisoblanadi.
 * Mijozdan kelgan raqamga ishonilsa, ESKIRGAN ekrandan yuborilgan
 * qiymat qoldiqni noto'g'ri yopib, balansni MANFIYGA tushirib qo'yardi.
 */
export const adjustmentSettleSchema = z.object({
  params: z.object({ teacherId: objectId }),
  body: z.object({
    reason: z.string().trim().min(1).max(500),
    branchId: objectId.optional(),
  }),
});

export type SalaryListRequest = z.infer<typeof salaryListSchema>;
export type SalaryIdRequest = z.infer<typeof salaryIdSchema>;
export type SalaryTeacherIdRequest = z.infer<typeof salaryTeacherIdSchema>;
export type ObligationsRequest = z.infer<typeof obligationsSchema>;
export type TransactionCreateRequest = z.infer<typeof transactionCreateSchema>;
export type TransactionIdRequest = z.infer<typeof transactionIdSchema>;
export type CompensationSetRequest = z.infer<typeof compensationSetSchema>;
export type CompensationAmendRequest = z.infer<typeof compensationAmendSchema>;
export type CompensationIdRequest = z.infer<typeof compensationIdSchema>;
export type CompensationTeacherIdRequest = z.infer<typeof compensationTeacherIdSchema>;
export type AdjustmentCreateRequest = z.infer<typeof adjustmentCreateSchema>;
export type AdjustmentSettleRequest = z.infer<typeof adjustmentSettleSchema>;
