import { z } from 'zod';

/** `server/src/modules/rooms/validators/*.js` NING AYNAN KO'CHIRMASI. */

const shared = {
  capacity: z.union([z.coerce.number().int().min(0).max(1000), z.null()]).optional(),
  // Maydon kasrli bo'lishi mumkin (18.5 kv.m).
  areaM2: z.union([z.coerce.number().min(0).max(100000), z.null()]).optional(),
  equipment: z.array(z.string().trim().max(60)).max(30).optional(),
  note: z.string().trim().max(300).optional(),
};

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    // FILIAL FILTRI — "Filial A → Xonalar" oqimi uchun.
    //
    // Bu QISHTIRISH, kengaytirish EMAS: servis so'ralgan filial
    // chaqiruvchining ko'lamida ekanini tekshiradi va bo'lmasa 403
    // qaytaradi. Ya'ni bu parametr bilan hech kim o'z ko'lamidan
    // tashqariga chiqa olmaydi.
    //
    // ⚠ PARAMETRNI SXEMADAN OLIB TASHLAMANG. Ilgari u JIMGINA tashlab
    // yuborilardi: klient `?branchId=...` yuborardi, validator uni
    // `query` dan olib tashlardi va ro'yxat BUTUN ko'lam bo'yicha
    // qaytardi — "A filiali → Xonalar" ekranida B filialining xonalari
    // ham ko'rinardi va xato hech qanday belgi bermasdi.
    branchId: z.string().min(1).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const createSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Xona nomi kerak').max(80),
    // "Barcha filiallar" rejimida formada ochiq tanlanadi. Ko'lam
    // tekshiruvi servisda (`resolveBranchForWrite`).
    branchId: z.string().min(1).optional(),
    ...shared,
  }),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().trim().min(1).max(80).optional(),
    branchId: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
    ...shared,
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
