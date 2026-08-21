// ⚠ `server/src/modules/financeReport/validators/*.js` DAN AYNAN
// KO'CHIRILGAN. Chegaralar (`min`/`max`) O'ZGARTIRILMASIN — ular xato
// javobidagi `details[].path` va `message` bilan birga klient
// shartnomasining bir qismi.
import { z } from 'zod';

export const periodSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const trendSchema = z.object({
  query: z.object({
    months: z.coerce.number().int().min(1).max(24).optional(),
  }),
});

export const breakdownSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const writeOffsSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    groupId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export type PeriodRequest = z.infer<typeof periodSchema>;
export type TrendRequest = z.infer<typeof trendSchema>;
export type BreakdownRequest = z.infer<typeof breakdownSchema>;
export type WriteOffsRequest = z.infer<typeof writeOffsSchema>;
