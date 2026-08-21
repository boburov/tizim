import { z } from 'zod';
import { LEAD_STATUSES } from '../../common/constants/lead-status.js';

/** `modules/leads/validators/*.js` NING AYNAN KO'CHIRMASI. */

const statusEnum = z.enum(LEAD_STATUSES);

export const listSchema = z.object({
  query: z.object({
    status: statusEnum.optional(),
    source: z.string().optional(),
    direction: z.string().optional(),
    // MAS'UL bo'yicha filtr. "none" — mas'uli yo'q lidlar (eng xavflisi:
    // ular bilan HECH KIM ishlamaydi).
    assignedTo: z.string().optional(),
    // ALOQA holati bo'yicha filtr:
    //   no_contact — hech kim qo'lga olmagan (status "new", tarix bo'sh)
    //   stale      — aloqa qilingan, lekin 7+ kun tashlab qo'yilgan
    // ⚠ Status filtridan ATAYLAB ajratilgan: "new" statusdagi lidlarning
    // bir qismi bilan allaqachon ishlangan bo'lishi mumkin.
    engagement: z.enum(['no_contact', 'stale']).optional(),
    search: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const statsSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
});

const leadFields = {
  firstName: z.string().min(1).max(60),
  lastName: z.string().max(60).optional(),
  age: z.coerce.number().int().min(1).max(120).nullable().optional(),
  phone: z.string().min(9, 'Telefon kerak'),
  parentPhone: z.string().nullable().optional(),
  sourceId: z.string().nullable().optional(),
  directionId: z.string().nullable().optional(),
  rejectionReasonId: z.string().nullable().optional(),
  // Lid bilan ishlaydigan xodim. Eslatma AYNAN shu odamga boradi.
  assignedTo: z.string().nullable().optional(),
  status: statusEnum.optional(),
  trialDate: z.coerce.date().nullable().optional(),
  notes: z.string().max(2000).optional(),
  rejectionNote: z.string().max(1000).optional(),
};

/**
 * ⚠ LIDNI YOPISHDA IZOH MAJBURIY — VA U VALIDATORDA (servisda EMAS).
 *
 * Sabab: qoida `create` va `update` IKKALASIGA ham bir xil qo'llanishi
 * kerak, va foydalanuvchi 400 javobida aynan QAYSI maydon
 * yetishmayotganini ko'rishi lozim.
 *
 * ⚠ MINIMAL UZUNLIK 10 BELGI VA U KAMAYTIRILMASIN: "yo'q", "ok", "-"
 * kabi javoblar shartni qanoatlantiradi-yu, tahlil uchun HECH NARSA
 * bermaydi.
 */
const MIN_NOTE = 10;

export const assertClosingNote = (b: Record<string, any>, ctx: z.RefinementCtx): void => {
  if (b.status !== 'rejected') return;

  const note = (b.rejectionNote || '').trim();
  if (note.length < MIN_NOTE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rejectionNote'],
      message:
        'Lidni yopishda izoh majburiy: mijoz nima dedi? ' +
        '(narx, joylashuv, vaqt, boshqa markaz...). Kamida 10 ta belgi.',
    });
  }
  if (!b.rejectionReasonId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rejectionReasonId'],
      message: 'Rad etish sababini tanlang',
    });
  }
};

export const createSchema = z.object({
  body: z
    .object({
      ...leadFields,
      // ⚠ FAQAT YARATISHDA: "Barcha filiallar" rejimida klient formada
      // qaysi filialga yozishni so'raydi. Tahrirlashda YO'Q — lidni
      // filialdan filialga ko'chirish ALOHIDA amal.
      branchId: z.string().nullable().optional(),
    })
    // Lid darhol "rad etilgan" holatda yaratilishi ham mumkin (kelib
    // so'radi-yu, qiziqmadi) — u holda ham izoh majburiy.
    .superRefine(assertClosingNote),
});

export const updateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      ...leadFields,
      firstName: z.string().min(1).max(60).optional(),
      phone: z.string().min(9).optional(),
    })
    .refine((b) => Object.keys(b).length > 0, {
      message: "Hech bo'lmaganda bitta maydon kerak",
    })
    .superRefine(assertClosingNote),
});

export const reminderSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    followUpAt: z.coerce.date().nullable().optional(),
    followUpNote: z.string().max(500).optional(),
  }),
});

/**
 * ⚠ KO'P LIDGA bir martada eslatma. Chegara 200 ta: bundan ko'pi bir
 * so'rovda ishlanmasin — ro'yxatni bo'lib yuborish kerak.
 */
export const reminderBulkSchema = z.object({
  body: z.object({
    ids: z.array(z.string().min(1)).min(1).max(200),
    followUpAt: z.coerce.date().nullable().optional(),
    followUpNote: z.string().max(500).optional(),
    // Berilsa — tanlangan lidlarning MAS'ULI ham almashtiriladi.
    assignedTo: z.string().nullable().optional(),
  }),
});

export const routingCreateSchema = z.object({
  body: z.object({
    branchId: z.string().min(1),
    // Zaxira qoidada manba BO'LMAYDI — servis buni tekshiradi.
    sourceKey: z.string().trim().max(80).optional().nullable(),
    isFallback: z.boolean().optional(),
    assigneeId: z.union([z.string().min(1), z.null()]).optional(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const routingUpdateSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    branchId: z.string().min(1).optional(),
    assigneeId: z.union([z.string().min(1), z.null()]).optional(),
    priority: z.coerce.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(300).optional(),
  }),
});

export const routingIdSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type StatsRequest = z.infer<typeof statsSchema>;
export type CreateRequest = z.infer<typeof createSchema>;
export type UpdateRequest = z.infer<typeof updateSchema>;
export type ReminderRequest = z.infer<typeof reminderSchema>;
export type ReminderBulkRequest = z.infer<typeof reminderBulkSchema>;
export type RoutingCreateRequest = z.infer<typeof routingCreateSchema>;
export type RoutingUpdateRequest = z.infer<typeof routingUpdateSchema>;
export type RoutingIdRequest = z.infer<typeof routingIdSchema>;

// ─────────────────── LIDNI O'QUVCHIGA AYLANTIRISH ───────────────────
// ⚠ `validators/leads.validators.js` NING AYNAN KO'CHIRMASI.

const convertFields = {
  firstName: z.string().min(1, 'Ism kerak').max(60),
  lastName: z.string().min(1, 'Familiya kerak').max(60),
  username: z.string().min(3, 'Username kamida 3 belgidan iborat').max(40),
  phone: z.string().min(9, 'Telefon kerak'),
  password: z.string().min(6, 'Parol kamida 6 belgidan iborat'),
  gender: z.enum(['male', 'female']).nullable().optional(),
  enrolledAt: z.coerce.date().nullable().optional(),
};

export const convertSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    ...convertFields,
    // Ixtiyoriy: aylantirish bilan BIR VAQTDA guruhga qabul qilish.
    // Bo'sh bo'lsa o'quvchi guruhsiz yaratiladi (eski xatti-harakat).
    groupId: z.string().nullable().optional(),
  }),
});

/**
 * Ko'p lidni bir martada aylantirish.
 *
 * ⚠ Har lid uchun login/parol ALOHIDA keladi — klient ularni
 * generatsiya qiladi va operator tahrirlay oladi.
 */
export const convertBulkSchema = z.object({
  body: z.object({
    leads: z
      .array(z.object({ id: z.string().min(1), ...convertFields }))
      .min(1, 'Kamida bitta lid tanlang')
      .max(100, "Bir martada ko'pi bilan 100 ta lid"),
    groupId: z.string().nullable().optional(),
  }),
});

export type ConvertRequest = z.infer<typeof convertSchema>;
export type ConvertBulkRequest = z.infer<typeof convertBulkSchema>;
