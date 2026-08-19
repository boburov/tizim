import { z } from "zod";

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    // FILIAL FILTRI — "Filial A → Xonalar" oqimi uchun (talab 10).
    //
    // Bu QISHTIRISH, kengaytirish emas: servis so'ralgan filial
    // chaqiruvchining ko'lamida ekanini tekshiradi va bo'lmasa 403
    // qaytaradi. Ya'ni bu parametr bilan hech kim o'z ko'lamidan
    // tashqariga chiqa olmaydi.
    //
    // ILGARI PARAMETR JIMGINA TASHLAB YUBORILARDI: client
    // `?branchId=...` yuborardi, validator uni `query` dan olib
    // tashlardi va ro'yxat BUTUN ko'lam bo'yicha qaytardi. Natijada
    // "A filiali → Xonalar" ekranida B filialining xonalari ham
    // ko'rinardi — xato hech qanday belgi bermasdi.
    branchId: z.string().min(1).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === "true")
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});
