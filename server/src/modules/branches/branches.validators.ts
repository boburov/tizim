import { z } from 'zod';
import { ALL_DELEGATION_MODES } from '../../common/constants/delegation.js';

/** `server/src/modules/branches/validators/*.js` NING AYNAN KO'CHIRMASI. */

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const listSchema = z.object({
  query: z.object({
    search: z.string().optional(),
    // Boshqaruvchi loginini javobga qo'shish. Ruxsat KONTROLLERDA
    // tekshiriladi — bu yerda faqat shakl.
    withManagers: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    includeInactive: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

/**
 * FILIAL + DIREKTOR birga yaratilishi MUMKIN, lekin MAJBURIY EMAS.
 *
 * ⚠ Ilgari direktor majburiy edi va bu HALQA hosil qilardi: yaratilgan
 * har bir filialda darhol 1 ta foydalanuvchi paydo bo'lardi, `softRemove`
 * esa foydalanuvchisi bor filialni o'chirishni taqiqlaydi — ya'ni
 * yaratilgan filialni HECH QACHON o'chirib bo'lmasdi.
 */
const directorSchema = z.object({
  // ISM IXTIYORIY — tezkor filial ochishda faqat login+parol ma'lum
  // bo'ladi. MAJBURIYLIK LOGIN VA PAROLDA QOLADI.
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  username: z.string().min(3, 'Login kamida 3 belgi').max(40),
  password: z.string().min(6, 'Parol kamida 6 belgi').max(100),
  phone: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === '' ? undefined : v)),
  // Bo'sh bo'lsa "director" roli ishlatiladi (seed qilingan shablon).
  role: z.string().min(1).max(40).optional(),
});

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Filial nomi kerak').max(120),
    code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    expenseApprovalThreshold: z
      .union([z.coerce.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
    // Bo'sh obyekt ham "yo'q" deb qabul qilinadi — klient forma
    // maydonlarini bo'sh satr bilan yuboradi va ular yarim to'ldirilgan
    // direktor yaratmasligi kerak.
    director: z.preprocess((v) => {
      if (!v || typeof v !== 'object') return undefined;
      const o = v as Record<string, unknown>;
      const filled = ['firstName', 'lastName', 'username', 'password'].some(
        (k) => String(o[k] ?? '').trim() !== '',
      );
      return filled ? v : undefined;
    }, directorSchema.optional()),
  }),
});

/**
 * DELEGATSIYA MATRITSASI (ixtiyoriy). Kalit = tasdiq turi.
 *
 * Bu yerda faqat SHAKL tekshiriladi — qaysi rejim qaysi turga mos
 * kelishi (masalan maoshda `auto` taqiqlangani) `validateDelegation` da,
 * chunki u qoida servis va seed uchun BITTA manba bo'lishi kerak.
 */
export const delegationRuleSchema = z.object({
  mode: z.enum(ALL_DELEGATION_MODES as [string, ...string[]]),
  maxAmount: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(),
  minAmount: z.union([z.coerce.number().min(0).max(1_000_000_000), z.null()]).optional(),
  maxPercent: z.union([z.coerce.number().min(0).max(100), z.null()]).optional(),
});

export const delegationSchema = z.record(z.string(), delegationRuleSchema);

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).max(120).optional(),
    code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    isActive: z.boolean().optional(),
    // Chiqim limiti: null/0 = cheksiz
    expenseApprovalThreshold: z
      .union([z.coerce.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
    // Filial rahbariga qaysi sozlama amallari ishonib topshirilgani.
    delegation: delegationSchema.optional(),
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
