import { z } from "zod";
import { ALL_DELEGATION_MODES } from "../../../constants/delegation.js";

// DELEGATSIYA MATRITSASI (ixtiyoriy). Kalit = tasdiq turi.
//
// Bu yerda faqat SHAKL tekshiriladi - qaysi rejim qaysi turga mos
// kelishi (masalan maoshda `auto` taqiqlangani) constants/delegation.js
// dagi validateDelegation'da, chunki u qoida servis, model va seed
// uchun BITTA manba bo'lishi kerak.
export const delegationRuleSchema = z.object({
  mode: z.enum(ALL_DELEGATION_MODES),
  maxAmount: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(),
  minAmount: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(),
  maxPercent: z.union([z.coerce.number().min(0).max(100), z.null()]).optional(),
});

export const delegationSchema = z.record(z.string(), delegationRuleSchema);

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    isActive: z.boolean().optional(),
    // Chiqim limiti: null/0 = cheksiz
    expenseApprovalThreshold: z
      .union([z.coerce.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
    // Filial rahbariga qaysi sozlama amallari ishonib topshirilgani.
    delegation: delegationSchema.optional(),
  }),
});
