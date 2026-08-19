import { z } from "zod";

/**
 * TAHLIL FILTRLARI — barcha endpoint uchun UMUMIY shakl.
 *
 * Hammasi IXTIYORIY: berilmasa joriy oy olinadi. Talab shuni aytadi —
 * "Do not force irrelevant filters".
 *
 * `.optional()` va `coerce`: query parametrlari HAR DOIM satr bo'lib
 * keladi, shuning uchun son/sana konvertatsiyasi shu yerda.
 */
const id = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID formati noto'g'ri");

export const analyticsFilterSchema = z.object({
  query: z.object({
    from: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    to: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),

    branchId: id.optional(),
    teacherId: id.optional(),
    courseId: id.optional(),
    groupId: id.optional(),
    roomId: id.optional(),
    studentId: id.optional(),
    expenseCategoryId: id.optional(),

    paymentMethod: z
      .enum(["cash", "card", "click", "payme", "uzcard", "humo", "bank", "transfer"])
      .optional(),
    costType: z.enum(["fixed", "variable"]).optional(),
    accountKind: z
      .enum(["cash", "terminal", "click", "payme", "bank", "transit", "uzcard", "humo", "other"])
      .optional(),

    granularity: z.enum(["day", "week", "month"]).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

/** Kesim (breakdown) tanlovi — faqat ruxsat etilgan qiymatlar. */
export const breakdownSchema = z.object({
  params: z.object({
    by: z.enum(["branch", "course", "teacher", "group", "room", "method"]),
  }),
  query: analyticsFilterSchema.shape.query,
});

export const receivablesBreakdownSchema = z.object({
  params: z.object({ by: z.enum(["branch", "course", "group", "student"]) }),
  query: analyticsFilterSchema.shape.query,
});

/** Bitta jurnal yozuvi tafsiloti. */
export const entryIdSchema = z.object({
  params: z.object({ id: id }),
});
