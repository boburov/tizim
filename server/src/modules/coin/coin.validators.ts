import { z } from 'zod';

/** Mongo ObjectId merosi — butun kodbazada shu shakl. */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri identifikator");

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
};

export const emptySchema = z.object({});

export const historySchema = z.object({
  query: z.object({
    ...pageQuery,
    kind: z.enum(['attendance', 'grade', 'purchase', 'refund', 'manual']).optional(),
  }),
});

export const userHistorySchema = z.object({
  params: z.object({ userId: objectId }),
  query: z.object({
    ...pageQuery,
    kind: z.enum(['attendance', 'grade', 'purchase', 'refund', 'manual']).optional(),
  }),
});

export const statsSchema = z.object({
  query: z.object({
    // ⚠ YUQORI CHEGARA 180. Cheklovsiz `?days=100000` butun ledgerni
    // xotiraga tortardi; servis ham qayta chegaralaydi (ikki qatlam).
    days: z.coerce.number().int().min(1).max(180).optional(),
  }),
});

export const leaderboardSchema = z.object({
  query: z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }),
});

export const adjustSchema = z.object({
  body: z.object({
    userId: objectId,
    // ⚠ `int()` SHART: "5.5 tanga" degan tushuncha yo'q va kasr qiymat
    // bazadagi INTEGER ustunda jimgina kesilardi.
    delta: z.coerce.number().int().refine((v) => v !== 0, 'Miqdor noldan farqli bo\'lsin'),
    reason: z.string().max(200).optional(),
  }),
});

export const settingsUpdateSchema = z.object({
  body: z
    .object({
      isEnabled: z.boolean().optional(),
      marketEnabled: z.boolean().optional(),
      orderAutoApprove: z.boolean().optional(),
      coinLabel: z.string().min(1).max(24).optional(),
      attendancePresentCoins: z.coerce.number().int().min(0).max(1000).optional(),
      attendanceExcusedCoins: z.coerce.number().int().min(0).max(1000).optional(),
      gradeMinValue: z.coerce.number().int().min(1).max(5).optional(),
      gradeCoinsPerPoint: z.coerce.number().int().min(0).max(1000).optional(),
      dailyEarnLimit: z.coerce.number().int().min(0).max(1000000).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});


export type HistoryRequest = z.infer<typeof historySchema>;
export type UserHistoryRequest = z.infer<typeof userHistorySchema>;
export type StatsRequest = z.infer<typeof statsSchema>;
export type LeaderboardRequest = z.infer<typeof leaderboardSchema>;
export type AdjustRequest = z.infer<typeof adjustSchema>;
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateSchema>;
