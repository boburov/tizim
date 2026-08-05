import { z } from "zod";
import { STAFF_SALARY_TYPES } from "../../../models/staffCompensation.model.js";
import { KPI_TRIGGERS, KPI_REWARD_TYPES } from "../../../models/kpiRule.model.js";
import { STAFF_ADJUSTMENT_KINDS } from "../../../models/staffPayrollAdjustment.model.js";

// Modul bo'yicha yagona pul turi (o'qituvchi validatoridagi bilan bir xil
// chegara - ikki modulda ikki xil limit bo'lib qolmasin).
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const id = z.string().min(1);

export const listSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    employeeId: id.optional(),
    status: z.enum(["unpaid", "partial", "paid"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(300).optional(),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id }) });

export const employeeParamSchema = z.object({
  params: z.object({ employeeId: id }),
});

export const generateSchema = z.object({
  body: z.object({
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

export const recomputeSchema = z.object({
  params: z.object({ id }),
  body: z.object({ force: z.coerce.boolean().optional() }).optional(),
});

export const lifecycleSchema = z.object({
  params: z.object({ id }),
  body: z.object({ lifecycle: z.enum(["draft", "finalized"]) }),
});

// --- Shartnoma ---
export const compensationSetSchema = z.object({
  body: z.object({
    employee: id,
    salaryType: z.enum(STAFF_SALARY_TYPES),
    baseAmount: money.optional(),
    effectiveFrom: z.string().optional(),
    branchId: id.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  }),
});

export const compensationPatchSchema = z.object({
  params: z.object({ id }),
  body: z.object({
    salaryType: z.enum(STAFF_SALARY_TYPES).optional(),
    baseAmount: money.optional(),
    branchId: id.nullable().optional(),
    note: z.string().trim().max(500).optional(),
  }),
});

// --- Bonus / jarima ---
export const adjustmentCreateSchema = z.object({
  body: z.object({
    employee: id,
    branchId: id.nullable().optional(),
    year: z.coerce.number().int().min(2000).max(3000),
    month: z.coerce.number().int().min(1).max(12),
    kind: z.enum(STAFF_ADJUSTMENT_KINDS),
    amount: z.coerce.number().int().positive().max(1_000_000_000),
    reason: z.string().trim().min(1, "Sabab ko'rsatilishi shart").max(500),
    occurredAt: z.string().optional(),
  }),
});

// --- KPI qoidasi ---
export const ruleCreateSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    trigger: z.enum(KPI_TRIGGERS),
    conditions: z.record(z.any()).optional(),
    rewardType: z.enum(KPI_REWARD_TYPES),
    rewardValue: z.coerce.number().min(0).max(1_000_000_000),
    applicableRoles: z.array(z.string().min(1).max(40)).optional(),
    branchId: id.nullable().optional(),
    monthlyCap: money.optional(),
    enabled: z.coerce.boolean().optional(),
  }),
});

export const ruleUpdateSchema = z.object({
  params: z.object({ id }),
  body: ruleCreateSchema.shape.body.partial(),
});

export const ruleListSchema = z.object({
  query: z.object({
    enabled: z.enum(["true", "false"]).optional(),
    trigger: z.enum(KPI_TRIGGERS).optional(),
  }),
});

// --- Biriktiruv ---
export const assignmentSetSchema = z.object({
  body: z.object({
    employee: id,
    rule: id,
    enabled: z.coerce.boolean().optional(),
    rewardValueOverride: z.union([money, z.literal(""), z.null()]).optional(),
  }),
});

// --- To'lov ---
export const transactionCreateSchema = z.object({
  body: z.object({
    payrollId: id,
    amount: z.coerce.number().int().positive().max(1_000_000_000),
    method: z.enum(["cash", "card"]),
    paidAt: z.string().optional(),
    note: z.string().trim().max(300).optional(),
    employeeName: z.string().trim().max(120).optional(),
    requestNote: z.string().trim().max(500).optional(),
  }),
});
