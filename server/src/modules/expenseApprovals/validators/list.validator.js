import { z } from "zod";
import {
  ALL_APPROVAL_STATUSES,
  ALL_APPROVAL_KINDS,
  ALL_APPROVAL_CATEGORIES,
} from "../../../models/approval.model.js";

// Saralash OQ RO'YXAT bilan cheklangan: query'dan kelgan matnni to'g'ridan
// to'g'ri .sort() ga uzatish mumkin emas (ixtiyoriy maydon bo'yicha
// indekssiz saralash va ma'lumot sizib chiqishi xavfi).
export const SORT_OPTIONS = Object.freeze({
  "-createdAt": { createdAt: -1 },
  createdAt: { createdAt: 1 },
  "-amount": { amount: -1, createdAt: -1 },
  amount: { amount: 1, createdAt: -1 },
});

export const ALL_SORT_KEYS = Object.keys(SORT_OPTIONS);

export const listSchema = z.object({
  query: z.object({
    status: z.enum(ALL_APPROVAL_STATUSES).optional(),
    kind: z.enum(ALL_APPROVAL_KINDS).optional(),
    // Owner inbox'ini ikkiga bo'lish uchun ("Moliya" / "Sozlamalar" tab'lari).
    category: z.enum(ALL_APPROVAL_CATEGORIES).optional(),

    // Erkin qidiruv: subyekt nomi / kontekst / so'rov izohi bo'yicha.
    search: z.string().trim().min(1).max(100).optional(),

    sort: z.enum(ALL_SORT_KEYS).optional(),

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
