import { z } from 'zod';

/**
 * `server/src/modules/roles/validators/value.validator.js` bilan AYNAN
 * bir xil shakl — xato yo'llari (`params.value`) mos kelishi uchun.
 */
export const valueSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
});

export type ValueRequest = z.infer<typeof valueSchema>;
