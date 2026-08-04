import { z } from "zod";
import { CLEANUP_FREQUENCIES } from "../../../models/storageSettings.model.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri ID");

export const updateSettingsSchema = z.object({
  body: z.object({
    autoCleanupEnabled: z.boolean().optional(),
    frequency: z.enum(CLEANUP_FREQUENCIES).optional(),
    olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
  }),
});

/**
 * Tozalash so'rovi.
 *
 * `all: true` - HAMMASINI o'chirish. `.refine` bilan majburiy qildik:
 * ikkalasi ham berilmasa so'rov rad etiladi. Bo'sh tanani "hammasini
 * o'chir" deb talqin qilish juda xavfli standart bo'lardi.
 */
export const cleanupSchema = z.object({
  body: z
    .object({
      all: z.boolean().optional().default(false),
      olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
    })
    .refine((v) => v.all || v.olderThanDays !== undefined, {
      message: "Muddat yoki 'hammasi' bayrog'i ko'rsatilishi kerak",
    }),
});

export const listFilesSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(["size", "date"]).optional(),
  }),
});

export const fileIdSchema = z.object({
  params: z.object({ id: objectId }),
});
