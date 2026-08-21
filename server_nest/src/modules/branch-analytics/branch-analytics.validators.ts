import { z } from 'zod';

/**
 * `branchAnalytics/validators/analytics.validator.js` DAN — FAQAT
 * `roomUtilizationSchema`.
 *
 * ⚠ Boshqa sxemalar (`pnlSchema`, `rangeSchema`, `transferSchema`…)
 * ATAYLAB ko'chirilmadi: ularga tegishli marshrutlar hali
 * ko'chirilmagan va ular boshqa modul (moliya tahlili) ko'lamiga
 * kiradi.
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
