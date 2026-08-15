import { z } from "zod";

const range = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

export const pnlSchema = z.object({
  query: z.object({
    ...range,
    // true = ichki o'tkazmalar ayiriladi (tarmoq ko'rinishi).
    consolidated: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
  }),
});

export const rangeSchema = z.object({ query: z.object(range) });

export const transferPreviewSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  query: z.object({ toBranchId: z.string().min(1) }),
});

export const transferSchema = z.object({
  params: z.object({ studentId: z.string().min(1) }),
  body: z.object({
    toBranchId: z.string().min(1),
    note: z.string().trim().max(500).optional(),
  }),
});
