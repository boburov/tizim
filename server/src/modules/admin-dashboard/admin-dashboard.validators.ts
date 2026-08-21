import { z } from 'zod';

/** `modules/adminDashboard/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const periodSchema = z.object({
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const monthsBackSchema = z.object({
  query: z.object({
    months: z.coerce.number().int().min(1).max(24).optional(),
  }),
});

export const cashflowSchema = z.object({
  query: z.object({
    range: z.enum(['week', 'month', 'year']).optional(),
    // DAVR — `overview` bilan BIR XIL kontrakt. Berilmasa joriy davr.
    //
    // ⚠ `range="week"` da E'TIBORGA OLINMAYDI: "o'tgan oyning haftasi"
    // degan tushuncha yo'q (servisdagi izohga qarang).
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const studentStatsSchema = z.object({
  query: z.object({
    // Trend grafigi nechta oyni qamrasin (standart 12).
    months: z.coerce.number().int().min(1).max(24).optional(),
    // So'nggi ro'yxatga olinganlar ro'yxati uzunligi (standart 8).
    recentLimit: z.coerce.number().int().min(1).max(50).optional(),
  }),
});

export const retentionSchema = z.object({
  query: z.object({
    // `leftAt` diapazoni (ixtiyoriy) — berilmasa BUTUN tarix.
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
  }),
});

export type PeriodRequest = z.infer<typeof periodSchema>;
export type MonthsBackRequest = z.infer<typeof monthsBackSchema>;
export type CashflowRequest = z.infer<typeof cashflowSchema>;
export type StudentStatsRequest = z.infer<typeof studentStatsSchema>;
export type RetentionRequest = z.infer<typeof retentionSchema>;
