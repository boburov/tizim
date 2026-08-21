import { z } from 'zod';
import {
  ALL_ROLE_TYPES,
  type RoleTypeValue,
} from '../../common/constants/permissions.js';

/**
 * `server/src/modules/roles/validators/*.js` NING AYNAN KO'CHIRMASI.
 *
 * Sxemalar butun so'rovni bitta obyekt sifatida oladi
 * (`{ body, query, params }`) — xato yo'llari (`details[].path`) Express
 * bilan bir xil chiqishi uchun. Masalan `"params.value"`, `"body.label"`.
 */

/**
 * ⚠ 24 BELGILI HEX — MONGO DAVRIDAN QOLGAN SHAKL.
 *
 * Bazada `Permission.id` hamon shu ko'rinishda (`@default(cuid())` EMAS,
 * migratsiyada eski ObjectId satrlari saqlab qolingan), shuning uchun
 * tekshiruv ATAYLAB o'zgartirilmadi. Uni "zamonaviylashtirish" mavjud
 * frontend so'rovlarini 400 bilan rad etardi.
 */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri identifikator");

export const valueSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
});

export const removeSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  query: z.object({
    // Rolda foydalanuvchi bo'lsa — ularni qaysi rolga ko'chirish kerakligi.
    migrateTo: z.string().min(1).optional(),
  }),
});

export const createSchema = z.object({
  body: z.object({
    label: z.string().min(2, 'Rol nomi kerak').max(60),
    description: z.string().max(300).optional(),
    // `value` (slug) serverda avtomatik generatsiya qilinadi — mijozdan olinmaydi.
    permissionIds: z.array(objectId).default([]),
    roleType: z.enum(ALL_ROLE_TYPES as [RoleTypeValue, ...RoleTypeValue[]]).optional(),
    defaultPath: z.string().max(120).optional(),
  }),
});

export const updateSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  body: z
    .object({
      label: z.string().min(2).max(60).optional(),
      description: z.string().max(300).optional(),
      permissionIds: z.array(objectId).optional(),
      roleType: z.enum(ALL_ROLE_TYPES as [RoleTypeValue, ...RoleTypeValue[]]).optional(),
      defaultPath: z.string().max(120).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, "O'zgartirish uchun maydon yuboring"),
});

export const freezeSchema = z.object({
  params: z.object({ value: z.string().min(1) }),
  body: z.object({
    isFrozen: z.boolean(),
    // Muzlatish sababi — login rad etilganda foydalanuvchiga ko'rsatiladi.
    reason: z.string().max(300).optional(),
  }),
});

export type ValueRequest = z.infer<typeof valueSchema>;
export type RemoveRequest = z.infer<typeof removeSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type FreezeRequest = z.infer<typeof freezeSchema>;
