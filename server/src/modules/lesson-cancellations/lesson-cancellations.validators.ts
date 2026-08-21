import { z } from 'zod';

/**
 * `lessonCancellations/validators/lessonCancellation.validator.js` NING
 * AYNAN KO'CHIRMASI.
 *
 * ⚠ `CANCELLATION_REASONS` `prisma/schema.prisma` dagi
 * `enum CancellationReason` bilan AYNAN bir xil bo'lishi SHART.
 */
export const CANCELLATION_REASONS = [
  'teacher_absent', // o'qituvchi kelmadi
  'facility', // xona/jihoz/svet muammosi
  'weather', // ob-havo
  'other',
] as const;

const objectId = z.string().min(1);

export const createSchema = z.object({
  body: z.object({
    group: objectId,
    date: z.union([z.string(), z.coerce.date()]),
    // Kunda bir nechta dars bo'lsa — qaysi biri ("14:00"). Bo'sh = butun kun.
    slot: z.string().trim().max(5).optional(),
    reason: z.enum(CANCELLATION_REASONS).optional(),
    note: z.string().trim().max(500).optional(),
    // Ko'chirilgan sana berilsa — dars baribir o'tiladi, pul o'zgarmaydi.
    makeupDate: z.union([z.string(), z.coerce.date()]).optional(),
    billable: z.coerce.boolean().optional(),
  }),
});

export const listSchema = z.object({
  query: z.object({
    groupId: objectId.optional(),
    year: z.coerce.number().int().min(2000).max(3000).optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
  }),
});

export const idParamSchema = z.object({ params: z.object({ id: objectId }) });

export type CreateRequest = z.infer<typeof createSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type IdParamRequest = z.infer<typeof idParamSchema>;
