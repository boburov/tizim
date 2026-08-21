import { z } from "zod";

const range = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const pnlSchema = z.object({
  query: z.object({
    ...range,
    // true = ichki o'tkazmalar ayiriladi (tarmoq ko'rinishi).
    consolidated: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
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

/**
 * XONA BANDLIGI.
 *
 * `dayStart`/`dayEnd` — ish kuni oralig'i. Ular BANDLIK MAXRAJINI
 * belgilaydi, ya'ni javobdagi foizning ma'nosini: 12 soatlik kunga
 * nisbatan 50% bandlik 8 soatlik kunga nisbatan 75% bo'ladi.
 * Shuning uchun ular so'rov parametri va javobda qaytadan
 * ko'rsatiladi (`window`) — ekran nimaga nisbatan hisoblanganini
 * aytishi kerak.
 */
export const roomUtilizationSchema = z.object({
  query: z.object({
    branchId: z.string().min(1).optional(),
    dayStart: z.coerce.number().int().min(0).max(23).optional(),
    dayEnd: z.coerce.number().int().min(1).max(24).optional(),
  }),
});
