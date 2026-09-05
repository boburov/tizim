import { z } from 'zod';
import { CLEANUP_FREQUENCIES } from './storage.constants.js';

/** `modules/storage/validators/storage.validator.js` NING AYNAN KO'CHIRMASI. */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri ID");

export const updateSettingsSchema = z.object({
  body: z.object({
    autoCleanupEnabled: z.boolean().optional(),
    frequency: z.enum(CLEANUP_FREQUENCIES as unknown as [string, ...string[]]).optional(),
    olderThanDays: z.coerce.number().int().min(1).max(3650).optional(),
  }),
});

/**
 * Tozalash so'rovi.
 *
 * ⚠ `.refine` MAJBURIY: `all` ham, `olderThanDays` ham berilmasa so'rov
 * RAD ETILADI. Bo'sh tanani "hammasini o'chir" deb talqin qilish juda
 * xavfli standart bo'lardi — bir bosishda butun markaz fayllari
 * yo'qolardi.
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
    // ⚠ Chegara 100 (umumiy `parsePagination` dagi 500 EMAS).
    limit: z.coerce.number().int().min(1).max(100).optional(),
    sort: z.enum(['size', 'date']).optional(),
  }),
});

export const fileIdSchema = z.object({
  params: z.object({ id: objectId }),
});

export type UpdateSettingsRequest = z.infer<typeof updateSettingsSchema>;
export type CleanupRequest = z.infer<typeof cleanupSchema>;
export type ListFilesRequest = z.infer<typeof listFilesSchema>;
export type FileIdRequest = z.infer<typeof fileIdSchema>;
