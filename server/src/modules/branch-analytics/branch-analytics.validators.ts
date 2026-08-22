import { z } from 'zod';

/**
 * `branchAnalytics/validators/analytics.validator.js` NING TO'LIQ
 * KO'CHIRMASI (11/11 marshrut).
 */
export const roomUtilizationSchema = z.object({
  query: z.object({
    branchId: z.string().min(1).optional(),
    // ⚠ `dayStart` 0 dan (yarim tun), `dayEnd` esa 1 dan 24 gacha —
    // "kun oxiri" 24:00 sifatida ifodalanadi.
    dayStart: z.coerce.number().int().min(0).max(23).optional(),
    dayEnd: z.coerce.number().int().min(1).max(24).optional(),
  }),
});

export type RoomUtilizationRequest = z.infer<typeof roomUtilizationSchema>;

/** Sana oralig'i — barcha tahlil marshrutlarida bir xil. */
const range = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const pnlSchema = z.object({
  query: z.object({
    ...range,
    // `true` = ichki o'tkazmalar AYIRILADI (tarmoq ko'rinishi).
    consolidated: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
  }),
});

export const rangeSchema = z.object({ query: z.object(range) });

export const transferPreviewSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  query: z.object({ toBranchId: z.string().min(1) }),
});

export const transferSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  body: z.object({
    toBranchId: z.string().min(1),
    note: z.string().trim().max(500).optional(),
  }),
});

export type PnlRequest = z.infer<typeof pnlSchema>;
export type RangeRequest = z.infer<typeof rangeSchema>;
export type TransferPreviewRequest = z.infer<typeof transferPreviewSchema>;
export type TransferRequest = z.infer<typeof transferSchema>;

export const roomDashboardSchema = z.object({
  query: z.object({
    branchId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export const roomFinderSchema = z.object({
  query: z.object({
    branchId: z.string().min(1).optional(),
    days: z.union([z.string(), z.array(z.string())])
      .transform(val => Array.isArray(val) ? val : [val])
      .pipe(z.array(z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])).min(1)),
    startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    capacity: z.coerce.number().min(1).optional(),
  }),
});

export const roomScheduleSchema = z.object({
  query: z.object({
    branchId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    roomId: z.string().min(1).optional(),
  }),
});

export type RoomDashboardRequest = z.infer<typeof roomDashboardSchema>;
export type RoomFinderRequest = z.infer<typeof roomFinderSchema>;
export type RoomScheduleRequest = z.infer<typeof roomScheduleSchema>;

export const roomDetailsSchema = z.object({
  params: z.object({ roomId: z.string().min(1) }),
  query: z.object({
    branchId: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

export type RoomDetailsRequest = z.infer<typeof roomDetailsSchema>;
