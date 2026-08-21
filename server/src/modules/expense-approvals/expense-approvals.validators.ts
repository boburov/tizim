// ⚠ `server/src/modules/expenseApprovals/validators/*.js` DAN AYNAN
// KO'CHIRILGAN.
import { z } from 'zod';
import {
  ALL_APPROVAL_STATUSES,
  ALL_APPROVAL_KINDS,
  ALL_APPROVAL_CATEGORIES,
} from '../../common/constants/approvals.js';

/**
 * Saralash OQ RO'YXAT bilan cheklangan: query'dan kelgan matnni
 * to'g'ridan-to'g'ri saralashga uzatish mumkin emas (ixtiyoriy maydon
 * bo'yicha indekssiz saralash va ma'lumot sizib chiqishi xavfi).
 *
 * Qiymat MONGO shaklida ({createdAt: -1}) qoladi — servis uni Prisma
 * shakliga o'giradi. Validator KLIENT SHARTNOMASINING bir qismi,
 * shuning uchun u o'zgartirilmaydi.
 */
export const SORT_OPTIONS: Record<string, Record<string, number>> = {
  '-createdAt': { createdAt: -1 },
  createdAt: { createdAt: 1 },
  '-amount': { amount: -1, createdAt: -1 },
  amount: { amount: 1, createdAt: -1 },
};

export const ALL_SORT_KEYS = Object.keys(SORT_OPTIONS);

export const listSchema = z.object({
  query: z.object({
    status: z.enum(ALL_APPROVAL_STATUSES as [string, ...string[]]).optional(),
    kind: z.enum(ALL_APPROVAL_KINDS as [string, ...string[]]).optional(),
    // Owner inbox'ini ikkiga bo'lish uchun ("Moliya" / "Sozlamalar" tab'lari).
    category: z.enum(ALL_APPROVAL_CATEGORIES as [string, ...string[]]).optional(),

    // Erkin qidiruv: subyekt nomi / kontekst / so'rov izohi bo'yicha.
    search: z.string().trim().min(1).max(100).optional(),

    sort: z.enum(ALL_SORT_KEYS as [string, ...string[]]).optional(),

    // createdAt oralig'i. `dateTo` kun OXIRIGACHA hisoblanadi (servisda).
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),

    // "Kim so'ragan" bo'yicha filtr.
    requestedBy: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Noto'g'ri foydalanuvchi ID")
      .optional(),

    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }),
});

export const decisionSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({ note: z.string().max(500).optional() }).optional(),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

// Ommaviy qaror uchun chegara. Har bir element alohida bajariladi va
// bajaruvchi bazaga yozadi - cheklovsiz ro'yxat bitta so'rovda yuzlab
// tranzaksiyani ishga tushirib, javobni timeout'ga olib borardi.
export const BULK_MAX = 50;

export const bulkSchema = z.object({
  body: z.object({
    ids: z
      .array(z.string().regex(/^[a-f\d]{24}$/i, "Noto'g'ri ID"))
      .min(1, "Kamida bitta so'rov tanlanishi kerak")
      .max(BULK_MAX, `Bir vaqtda ko'pi bilan ${BULK_MAX} ta so'rov`),
    note: z.string().trim().max(500).optional(),
  }),
});

export type ListRequest = z.infer<typeof listSchema>;
export type DecisionRequest = z.infer<typeof decisionSchema>;
export type IdRequest = z.infer<typeof idSchema>;
export type BulkRequest = z.infer<typeof bulkSchema>;
