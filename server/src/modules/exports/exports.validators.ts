import { z } from 'zod';

/**
 * EKSPORT SO'ROVI (`exports/validators/export.validator.js` KO'CHIRMASI).
 *
 * ⚠ IKKI BOSQICHLI TEKSHIRUV: bu yerda SHAKL, dataset'da MAZMUN.
 * Filtrlar bu yerda `record(unknown)` bilan qabul qilinadi va
 * dataset'ning O'Z `filterSchema` si bilan kontroller ichida QAYTA
 * tekshiriladi — chunki har bir dataset'da filtrlar boshqacha.
 *
 * ⚠ `columns` uchun `enum` SHART EMAS: kalitlar reyestr bo'yicha OQ
 * RO'YXATLANADI (`resolveColumns`), bu yerda faqat HAJM cheklanadi.
 */
export const downloadSchema = z.object({
  params: z.object({ datasetKey: z.string().min(1).max(64) }),
  body: z.object({
    columns: z.array(z.string().min(1).max(64)).max(64).optional(),
    filters: z.record(z.unknown()).optional(),
  }),
});

export type DownloadRequest = z.infer<typeof downloadSchema>;
