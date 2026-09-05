import { z } from 'zod';
import { MARKET_ORDER_STATUSES } from '../../common/constants/coin.js';

/**
 * MARKET VALIDATORLARI — `modules/coin/coin.validators.ts` DAN KO'CHIRILDI.
 *
 * Mahsulot va buyurtma sxemalari tanga (coin) modulida tug'ilgan — market
 * dastlab tanganing "ichki" qismi edi. Keyin market alohida modul bo'ldi,
 * sxemalar esa qolib ketdi va `market.controller.ts` begona modulning
 * DTO faylini import qilardi (chegara qoidasi R2). Endi har modul o'z
 * DTO'sini o'zi saqlaydi.
 *
 * `objectId` va `pageQuery` — kichik mahalliy yordamchilar; ular coin
 * bilan BAHAM KO'RILMAYDI (baham ko'rish yana o'sha bog'liqlikni qaytarardi).
 */

/** Mongo ObjectId merosi — butun kodbazada shu shakl. */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri identifikator");

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
};

export const productIdSchema = z.object({ params: z.object({ id: objectId }) });

export const productListSchema = z.object({
  query: z.object({
    ...pageQuery,
    search: z.string().max(120).optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    branchId: objectId.optional(),
  }),
});

export const productCreateSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Nom kerak').max(120),
    description: z.string().max(2000).optional(),
    imageUrl: z.string().max(500).optional(),
    price: z.coerce.number().int().min(0).max(10000000),
    // `null` = CHEKSIZ zaxira. `undefined` bilan farqi bor: yangilashda
    // `null` "cheksiz qil" degani, `undefined` esa "tegma".
    stock: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
    deliveryInfo: z.string().max(1000).optional(),
    deliveryDays: z.coerce.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    /** Faqat owner qo'ya oladi; `null` = butun markaz uchun. */
    branchId: objectId.nullable().optional(),
  }),
});

export const productUpdateSchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: z.string().min(1).max(120).optional(),
      description: z.string().max(2000).optional(),
      imageUrl: z.string().max(500).optional(),
      price: z.coerce.number().int().min(0).max(10000000).optional(),
      stock: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
      deliveryInfo: z.string().max(1000).optional(),
      deliveryDays: z.coerce.number().int().min(0).max(365).optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    }),
});

export const buySchema = z.object({
  body: z.object({
    productId: objectId,
    note: z.string().max(300).optional(),
  }),
});

export const orderListSchema = z.object({
  query: z.object({
    ...pageQuery,
    status: z.enum(MARKET_ORDER_STATUSES).optional(),
    userId: objectId.optional(),
  }),
});

export const orderStatusSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    status: z.enum(MARKET_ORDER_STATUSES),
    adminNote: z.string().max(500).optional(),
  }),
});

export const orderIdSchema = z.object({ params: z.object({ id: objectId }) });

export type ProductIdRequest = z.infer<typeof productIdSchema>;
export type ProductListRequest = z.infer<typeof productListSchema>;
export type ProductCreateRequest = z.infer<typeof productCreateSchema>;
export type ProductUpdateRequest = z.infer<typeof productUpdateSchema>;
export type BuyRequest = z.infer<typeof buySchema>;
export type OrderListRequest = z.infer<typeof orderListSchema>;
export type OrderStatusRequest = z.infer<typeof orderStatusSchema>;
export type OrderIdRequest = z.infer<typeof orderIdSchema>;
