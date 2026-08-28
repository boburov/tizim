// ⚠ `server/src/modules/expenses/validators/expense.validator.js` DAN
// AYNAN KO'CHIRILGAN.
import { z } from 'zod';
import {
  EXPENSE_METHODS,
  EXPENSE_CURRENCIES,
  EXPENSE_CATEGORY_KINDS,
} from '../../common/constants/expenses.js';

/** `z.enum` faqat literal kortejni qabul qiladi — ro'yxatlar `string[]`. */
const asEnum = (list: string[]) => z.enum(list as [string, ...string[]]);

const objectId = z.string().min(1);
const money = z.coerce.number().int().min(1).max(100_000_000_000);

// Chiqim yaratish/tahrirlash.
// DIQQAT: `branchId: null` ATAYLAB ruxsat etilgan - bu "markaz umumiy chiqimi"
// degani (ijara, brend reklamasi). `undefined` esa "joriy filial" degani.
const expenseBody = {
  category: objectId,
  title: z.string().trim().min(1, "Nomi kerak").max(200),
  description: z.string().trim().max(1000).optional(),
  amount: money,
  currency: asEnum(EXPENSE_CURRENCIES).optional(),
  originalAmount: z.coerce.number().min(0).optional(),
  exchangeRate: z.coerce.number().min(0).optional(),
  rateSource: z.string().trim().max(100).optional(),
  spentAt: z.union([z.string(), z.coerce.date()]).optional(),
  accrualYear: z.coerce.number().int().min(2000).max(3000).optional(),
  accrualMonth: z.coerce.number().int().min(1).max(12).optional(),
  method: asEnum(EXPENSE_METHODS).optional(),
  vendor: z.string().trim().max(200).optional(),
  receipt: objectId.nullable().optional(),
  branchId: objectId.nullable().optional(),
  allocation: z.enum(["none", "revenue", "students", "equal"]).optional(),
  isCapital: z.coerce.boolean().optional(),
  depreciationMonths: z.coerce.number().int().min(0).max(600).optional(),
  requestNote: z.string().trim().max(500).optional(),
};

// Kapital chiqim uchun amortizatsiya muddati MAJBURIY - modeldagi
// tekshiruvning nusxasi, lekin bu yerda foydalanuvchi 400 xatosini oladi.
const capitalGuard = (d: Record<string, unknown>) => !d.isCapital || ((d.depreciationMonths as number) ?? 0) > 0;
const capitalMsg = {
  message: "Kapital chiqim uchun amortizatsiya muddati (oy) ko'rsatilishi shart",
  path: ["depreciationMonths"],
};

export const createSchema = z.object({
  body: z.object(expenseBody).refine(capitalGuard, capitalMsg),
});

export const updateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object(
      Object.fromEntries(
        Object.entries(expenseBody).map(([k, val]) => [k, val.optional()]),
      ),
    )
    .refine(capitalGuard, capitalMsg),
});

export const idParamSchema = z.object({
  params: z.object({ id: objectId }),
});

export const listSchema = z.object({
  query: z.object({
    categoryId: objectId.optional(),
    kind: asEnum(EXPENSE_CATEGORY_KINDS).optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    // ERKIN QIDIRUV — nom, izoh yoki yetkazib beruvchi bo'yicha.
    // Kassir "kim uchun to'ladim" ni ESLAYDI, kategoriya nomini emas.
    search: z.string().trim().max(200).optional(),
    // ANIQ FILIAL. Super Admin uchun kesim tanlash vositasi; oddiy
    // administratorda u baribir `branchFilter()` bilan KESISHTIRILADI
    // (`scopeClause`), ya'ni begona filial ID si hech narsa ochmaydi.
    branchId: objectId.optional(),
    branchScope: z.enum(["branch-only", "with-shared"]).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
  }),
});

export const summarySchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

// ── Kategoriyalar ──
export const categoryListSchema = z.object({
  query: z.object({
    includeInactive: z.coerce.boolean().optional(),
  }),
});

export const categoryCreateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100),
    code: z.string().trim().max(40).optional(),
    kind: asEnum(EXPENSE_CATEGORY_KINDS).optional(),
    branchId: objectId.nullable().optional(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});

export const categoryUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    name: z.string().trim().min(1).max(100).optional(),
    kind: asEnum(EXPENSE_CATEGORY_KINDS).optional(),
    sortOrder: z.coerce.number().int().optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});

export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type IdParamRequest = z.infer<typeof idParamSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type SummaryRequest = z.infer<typeof summarySchema>;
export type CategoryListRequest = z.infer<typeof categoryListSchema>;
export type CategoryCreateRequest = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateRequest = z.infer<typeof categoryUpdateSchema>;
