import { z } from 'zod';

/** `modules/activityLogs/validators/list.validator.js` NING AYNAN KO'CHIRMASI. */

export const listSchema = z.object({
  query: z.object({
    userId: z.string().optional(),
    // Super admin panelidagi filial tanlagichi. Ko'lamni KENGAYTIRMAYDI
    // — servis uni ruxsat etilgan ro'yxat bilan `AND` qiladi.
    branchId: z.string().optional(),
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).optional(),
    action: z.enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT']).optional(),
    resourceType: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    // ⚠ `z.coerce.boolean()` EMAS: u "false" SATRINI ham `true` qiladi
    // (bo'sh bo'lmagan har qanday satr rost). Bayroq shu sababli aniq
    // "true" ga solishtiriladi.
    dangerousOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    page: z.coerce.number().int().min(1).optional(),
    // ⚠ Chegara 500 — umumiy `parsePagination` bilan BIR XIL.
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const rangeSchema = z.object({
  query: z.object({
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type IdRequest = z.infer<typeof idSchema>;
export type RangeRequest = z.infer<typeof rangeSchema>;

/**
 * MOLIYA TAB'I. `ActivityLog` filtrlaridan FARQ QILADI va ataylab
 * alohida sxema: bu yerda `method`/`path` yo'q (HTTP izi emas), lekin
 * `entityType` va moliyaviy `action` bor.
 */
export const financialListSchema = z.object({
  query: z.object({
    branchId: z.string().optional(),
    actorId: z.string().optional(),
    entityType: z.string().optional(),
    action: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

/** OYLIK TAB'I. Ko'lam XODIM orqali, shuning uchun `branchId` yo'q. */
export const payrollListSchema = z.object({
  query: z.object({
    employeeId: z.string().optional(),
    actorId: z.string().optional(),
    action: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export type FinancialListRequest = z.infer<typeof financialListSchema>;
export type PayrollListRequest = z.infer<typeof payrollListSchema>;
