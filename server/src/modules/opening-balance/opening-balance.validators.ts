import { z } from 'zod';
import { OPENING_MAX_AMOUNT } from '../../common/constants/opening-balance.js';

/**
 * `openingBalance/validators/openingBalance.validator.js` KO'CHIRMASI.
 *
 * ISHORA: `+` = markaz shu shaxsga qarzdor, `−` = shaxs markazga qarzdor.
 */

/**
 * ⚠ Bo'sh forma maydoni ("") "kiritilmagan" deb qabul qilinadi — aks
 * holda `z.coerce.number()` uni 0 ga aylantirib, "qoldiq nol" degan
 * ma'noda ham, "kiritilmagan" ma'noda ham bir xil ko'rinardi.
 */
export const openingAmountSchema = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z
    .coerce.number()
    .int("Boshlang'ich summa butun son bo'lishi kerak")
    .refine((n) => Math.abs(n) <= OPENING_MAX_AMOUNT, {
      message: `Boshlang'ich summa ${OPENING_MAX_AMOUNT.toLocaleString('ru-RU')} so'mdan oshmasligi kerak`,
    })
    .optional(),
);

export const openingNoteSchema = z.string().trim().max(500).optional();

export const createOpeningSchema = z.object({
  body: z.object({
    user: z.string().length(24, "Foydalanuvchi noto'g'ri"),
    amount: openingAmountSchema.refine((v) => v !== undefined && v !== 0, {
      message: "Boshlang'ich summa nolga teng bo'lmasligi kerak",
    }),
    // O'quvchi qarzi uchun IXTIYORIY: berilmasa yozuv guruhga
    // qo'shilishni KUTADI (`materializePendingForStudent`).
    group: z.string().length(24).optional().nullable(),
    note: openingNoteSchema,
  }),
});

export const listOpeningSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    pendingOnly: z
      .preprocess((v) => v === 'true' || v === true, z.boolean())
      .optional(),
  }),
});

export type CreateOpeningRequest = z.infer<typeof createOpeningSchema>;
export type ListOpeningRequest = z.infer<typeof listOpeningSchema>;
