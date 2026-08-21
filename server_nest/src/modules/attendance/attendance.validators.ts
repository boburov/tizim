import { z } from 'zod';

/**
 * `modules/attendance/validators/*.js` NING AYNAN KO'CHIRMASI.
 */

/**
 * ⚠ O'QISH uchun sana — TIMEZONE-XAVFSIZ.
 *
 * "YYYY-MM-DD" satri AFZAL (aniq kalendar kuni, zona aralashmaydi).
 * Orqaga-moslik uchun ISO instant ham qabul qilinadi; servisdagi
 * `parseLocalDay` uni mahalliy (Asia/Tashkent) kalendar kuniga
 * keltiradi. Satr holati SAQLANADI — servis o'zi aylantiradi.
 */
export const dateInputSchema = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"),
    z.coerce.date(),
  ])
  .transform((v) => (v instanceof Date ? v.toISOString() : v));

/**
 * ⚠⚠ YOZISH uchun sana — QAT'IY "YYYY-MM-DD", ISO INSTANT QABUL
 * QILINMAYDI (A-2 timezone xatosi).
 *
 * Aks holda kechki dars (masalan 20:30Z) `parseLocalDay` da +5 soat
 * bilan KEYINGI kunga siljib, davomat NOTO'G'RI kunga yozilardi.
 * Yozuvda kalendar kuni ANIQ bo'lishi shart.
 */
export const recordDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak");

/** Sessiya (slot): "" yoki "HH:mm". */
export const slotSchema = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/, "Sessiya formati noto'g'ri (HH:mm)")
  .max(5);

const itemSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(['present', 'absent', 'excused', 'exempt']),
  reason: z.string().max(300).optional(),
  // Kechikish daqiqasi — bir kunlik dars uzunligidan oshmasin (10 soat).
  lateMinutes: z.coerce.number().int().min(0).max(600).optional(),
});

export const bulkRecordSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    date: recordDateSchema,
    slot: slotSchema.optional(),
    items: z
      .array(itemSchema)
      .min(1, "Hech bo'lmaganda bitta yozuv kerak")
      // Bitta guruhda yuzlab o'quvchi bo'lmaydi; cheksiz `items` —
      // ortiqcha DB yuki.
      .max(500, "Bir martada 500 tadan ortiq yozuv yuborib bo'lmaydi")
      // ⚠ Takroriy `studentId` audit tarixini buzadi (servisda ham
      // tekshiriladi — ikki qatlam ataylab).
      .refine(
        (items) => new Set(items.map((it) => String(it.studentId))).size === items.length,
        { message: "Bir o'quvchi bir necha marta yuborildi" },
      ),
  }),
});

export const listForDateSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    date: dateInputSchema,
    slot: slotSchema.optional(),
  }),
});

export const studentMonthlySchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

export const studentYearSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
  }),
});

export const groupMonthlySchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
});

export const rangeQuerySchema = z.object({
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  }),
});

export const studentRangeSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
  }),
});

export const groupRangeSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({
    fromDate: dateInputSchema,
    toDate: dateInputSchema,
  }),
});

export const teacherStatusSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  query: z.object({ date: dateInputSchema }),
});

export const teacherSetSchema = z.object({
  params: z.object({ groupId: z.string().min(1) }),
  body: z.object({
    // Yozuv — QAT'IY kalendar kuni (A-2 timezone tuzatmasi).
    date: recordDateSchema,
    present: z.coerce.boolean(),
  }),
});

export type BulkRecordRequest = z.infer<typeof bulkRecordSchema>;
export type ListForDateRequest = z.infer<typeof listForDateSchema>;
export type StudentMonthlyRequest = z.infer<typeof studentMonthlySchema>;
export type StudentYearRequest = z.infer<typeof studentYearSchema>;
export type GroupMonthlyRequest = z.infer<typeof groupMonthlySchema>;
export type RangeQueryRequest = z.infer<typeof rangeQuerySchema>;
export type StudentRangeRequest = z.infer<typeof studentRangeSchema>;
export type GroupRangeRequest = z.infer<typeof groupRangeSchema>;
export type TeacherStatusRequest = z.infer<typeof teacherStatusSchema>;
export type TeacherSetRequest = z.infer<typeof teacherSetSchema>;
