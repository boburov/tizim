import { z } from 'zod';

/** `studentFreeze/validators/freeze.validator.js` NING AYNAN KO'CHIRMASI. */

export const studentIdSchema = z.object({
  params: z.object({ studentId: z.string().min(1, "O'quvchi kerak") }),
});

export const freezeSchema = z.object({
  params: z.object({ studentId: z.string().min(1, "O'quvchi kerak") }),
  body: z.object({
    startDate: z.coerce.date().nullable().optional(),
    reason: z.string().max(300).optional(),
  }),
});

export const unfreezeSchema = z.object({
  params: z.object({ studentId: z.string().min(1, "O'quvchi kerak") }),
  body: z.object({
    endDate: z.coerce.date().nullable().optional(),
  }),
});

export type StudentIdRequest = z.infer<typeof studentIdSchema>;
export type FreezeRequest = z.infer<typeof freezeSchema>;
export type UnfreezeRequest = z.infer<typeof unfreezeSchema>;
