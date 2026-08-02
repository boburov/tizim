import { z } from "zod";

export const importerKeySchema = z.object({
  params: z.object({ importerKey: z.string().min(1).max(64) }),
});

// Xatolik hisoboti uchun client qaytaradigan qatorlar.
//
// `raw` ixtiyoriy kalitlarga ega - importer'ga qarab har xil, shuning
// uchun record(unknown). Ular FAQAT Excel katagiga yoziladi (DB'ga
// tegmaydi), lekin hajmi cheklanadi - aks holda bitta so'rov bilan
// serverdan katta fayl generatsiya qildirish mumkin bo'lardi.
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

export const historySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});
