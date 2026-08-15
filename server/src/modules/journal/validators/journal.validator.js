import { z } from "zod";

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
