// ⚠ `server/src/modules/journal/validators/journal.validator.js` DAN
// AYNAN KO'CHIRILGAN. Sxema O'ZGARTIRILMASIN: `details[].path` xato
// javobida ko'rinadi, ya'ni u KLIENT SHARTNOMASINING bir qismi.

import { z } from 'zod';

export const balancesSchema = z.object({
  query: z.object({
    until: z.coerce.date().optional(),
    treasuryOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
  }),
});

export const shiftOpenSchema = z.object({
  body: z.object({
    cashierId: z.string().min(1).optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const shiftCloseSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    countedCash: z.coerce.number().int().min(0).max(100_000_000_000),
    note: z.string().trim().max(500).optional(),
  }),
});

export const shiftListSchema = z.object({
  query: z.object({
    status: z.enum(["open", "closed"]).optional(),
    cashierId: z.string().min(1).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const transferSendSchema = z.object({
  body: z.object({
    toBranchId: z.string().min(1),
    amount: z.coerce.number().int().min(1).max(100_000_000_000),
    note: z.string().trim().max(300).optional(),
    shiftId: z.string().min(1).optional(),
  }),
});

export const transferReceiveSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    // Berilmasa jo'natilgan summa qabul qilingan deb hisoblanadi.
    countedAmount: z.coerce.number().int().min(0).max(100_000_000_000).optional(),
    note: z.string().trim().max(500).optional(),
  }),
});

export const transferIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ note: z.string().trim().max(500).optional() }).optional(),
});

export const transferListSchema = z.object({
  query: z.object({
    status: z.enum(["in_transit", "received", "disputed", "canceled"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export type BalancesRequest = z.infer<typeof balancesSchema>;
export type ShiftOpenRequest = z.infer<typeof shiftOpenSchema>;
export type ShiftCloseRequest = z.infer<typeof shiftCloseSchema>;
export type ShiftListRequest = z.infer<typeof shiftListSchema>;
export type TransferSendRequest = z.infer<typeof transferSendSchema>;
export type TransferReceiveRequest = z.infer<typeof transferReceiveSchema>;
export type TransferIdRequest = z.infer<typeof transferIdSchema>;
export type TransferListRequest = z.infer<typeof transferListSchema>;
