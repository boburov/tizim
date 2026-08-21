import { z } from "zod";

// EKSPORT SO'ROVI.
//
// Filtrlar bu yerda `passthrough` bilan qabul qilinadi va dataset'ning
// O'Z filterSchema'si bilan handler ichida qayta tekshiriladi - chunki
// har bir dataset'da filtrlar boshqacha (to'lovlarda year/month,
// o'qituvchilarda status/sort). Ikki bosqichli tekshiruv: bu yerda
// shakl, dataset'da mazmun.
//
// `columns` - client tanlagan ustunlar. Bo'sh yoki berilmagan bo'lsa
// dataset'ning standart (default:true) ustunlari ishlatiladi.
// Kalitlar reyestr bo'yicha oq ro'yxatlanadi (resolveColumns), shuning
// uchun bu yerda enum shart emas - faqat hajmni cheklaymiz.
export const downloadSchema = z.object({
  params: z.object({
    datasetKey: z.string().min(1).max(64),
  }),
  body: z.object({
    columns: z.array(z.string().min(1).max(64)).max(64).optional(),
    filters: z.record(z.unknown()).optional(),
  }),
});
