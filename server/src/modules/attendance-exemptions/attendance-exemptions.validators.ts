// ⚠ `server/src/modules/attendanceExemptions/validators/*.js` DAN AYNAN
// KO'CHIRILGAN. Sxema o'zgartirilmasin — `details[].path` va `message`
// klient shartnomasining bir qismi.
import { z } from 'zod';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export const listSchema = z.object({
  query: z.object({
    studentId: z.string().optional(),
    isActive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const createSchema = z.object({
  body: z.object({
    student: z.string().min(1, "O'quvchi kerak"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    daysOfWeek: z.array(z.enum(DAYS)).optional(),
    reason: z.string().max(300).optional(),
    isActive: z.boolean().optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().nullable().optional(),
      daysOfWeek: z.array(z.enum(DAYS)).optional(),
      reason: z.string().max(300).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type IdRequest = z.infer<typeof idSchema>;
