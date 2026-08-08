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

// JADVAL OQIMI: client tahrirlagan qatorlar.
//
// `raw` ochiq kalitlarga ega (importer'ga qarab har xil), lekin HAJMI
// cheklanadi - aks holda bitta so'rov bilan 16 MB lik hujjat yozdirib,
// Mongo hujjat chegarasiga urdirish mumkin bo'lardi.
//
// DIQQAT: bu yerda faqat SHAKL tekshiriladi. Maydonlarning mazmuni
// (login band emasmi, guruh bormi, summa chegarada turibdimi) importer
// validateRow'ida server tomonda QAYTA tekshiriladi - client yuborgan
// hech narsaga ishonilmaydi.
const gridRowsSchema = z
  .array(
    z.object({
      rowNumber: z.coerce.number().int().min(1).optional(),
      raw: z.record(z.unknown()),
    }),
  )
  .min(1, "Qator yuborilmadi")
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
