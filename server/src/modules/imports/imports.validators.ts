import { z } from 'zod';

/** `imports/validators/imports.validator.js` NING AYNAN KO'CHIRMASI. */

export const importerKeySchema = z.object({
  params: z.object({ importerKey: z.string().min(1).max(64) }),
});

/**
 * Xatolik hisoboti uchun client QAYTARADIGAN qatorlar.
 *
 * ⚠ `raw` ixtiyoriy kalitlarga ega (importer'ga qarab har xil), shuning
 * uchun `record(unknown)`. Ular FAQAT Excel katagiga yoziladi (DB'ga
 * TEGMAYDI), lekin HAJMI cheklanadi — aks holda bitta so'rov bilan
 * serverdan katta fayl generatsiya qildirish mumkin bo'lardi.
 */
export const errorReportSchema = z.object({
  params: z.object({ importerKey: z.string().min(1).max(64) }),
  body: z.object({
    rows: z
      .array(
        z.object({
          rowNumber: z.coerce.number().int().min(1).optional(),
          raw: z.record(z.unknown()).optional(),
          errors: z
            .array(
              z.object({
                field: z.string().max(120).optional(),
                message: z.string().max(500),
              }),
            )
            .max(50)
            .optional(),
        }),
      )
      .max(5000),
  }),
});

/**
 * JADVAL OQIMI: client TAHRIRLAGAN qatorlar.
 *
 * ⚠ BU YERDA FAQAT SHAKL tekshiriladi. Maydonlarning MAZMUNI (login band
 * emasmi, guruh bormi, summa chegarada turibdimi) importer
 * `validateRow` ida server tomonda QAYTA tekshiriladi — client yuborgan
 * hech narsaga ISHONILMAYDI.
 */
const gridRowsSchema = z
  .array(
    z.object({
      rowNumber: z.coerce.number().int().min(1).optional(),
      raw: z.record(z.unknown()),
    }),
  )
  .min(1, 'Qator yuborilmadi')
  .max(2000, "Bir martada 2000 qatordan ko'p bo'lmasligi kerak");

export const validateRowsSchema = z.object({
  params: z.object({ importerKey: z.string().min(1).max(64) }),
  body: z.object({ rows: gridRowsSchema }),
});

export const createRowsSchema = z.object({
  params: z.object({ importerKey: z.string().min(1).max(64) }),
  body: z.object({
    rows: gridRowsSchema,
    fileName: z.string().max(255).optional(),
  }),
});

export const jobIdSchema = z.object({
  params: z.object({ jobId: z.string().length(24, "Noto'g'ri identifikator") }),
});

export const historySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export type ImporterKeyRequest = z.infer<typeof importerKeySchema>;
export type ErrorReportRequest = z.infer<typeof errorReportSchema>;
export type ValidateRowsRequest = z.infer<typeof validateRowsSchema>;
export type CreateRowsRequest = z.infer<typeof createRowsSchema>;
export type JobIdRequest = z.infer<typeof jobIdSchema>;
export type HistoryRequest = z.infer<typeof historySchema>;
