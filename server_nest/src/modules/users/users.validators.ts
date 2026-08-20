import { z } from 'zod';

/** `users/validators/update.validator.js` dagi `idSchema` bilan bir xil. */
export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type IdRequest = z.infer<typeof idSchema>;
