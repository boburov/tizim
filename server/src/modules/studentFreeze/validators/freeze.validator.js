import { z } from "zod";

export const studentIdSchema = z.object({
  params: z.object({
    studentId: z.string().min(1, "O'quvchi kerak"),
  }),
});

export const freezeSchema = z.object({
  params: z.object({
    studentId: z.string().min(1, "O'quvchi kerak"),
  }),
  body: z.object({
    startDate: z.coerce.date().nullable().optional(),
    reason: z.string().max(300).optional(),
  }),
});

export const unfreezeSchema = z.object({
  params: z.object({
    studentId: z.string().min(1, "O'quvchi kerak"),
  }),
  body: z.object({
    endDate: z.coerce.date().nullable().optional(),
  }),
});
