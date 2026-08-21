import { z } from 'zod';

/**
 * `server/src/modules/notifications/validators/*.js` NING AYNAN KO'CHIRMASI.
 *
 * ⚠ RO'YXATLAR QISQARTIRILMAYDI. `CATEGORIES` va `AUDIENCE_TYPES` Prisma
 * enum'lari bilan bir xil bo'lishi kerak, lekin bu yerda ATAYLAB QO'LDA
 * yozilgan — Express'da ham shunday. Enum'dan avtomatik hosil qilish
 * xavfli: sxemaga yangi qiymat qo'shilgan kunda u JIMGINA qabul
 * qilinadigan bo'lib qolardi va validatsiya chegarasi kengayardi.
 */

const CATEGORIES = [
  'payment_reminder',
  'debt_warning',
  'class_cancel',
  'announcement',
  'admin_personal',
  'teacher_message',
  'feedback_status',
  'holiday',
  'template_based',
  'other',
] as const;

/**
 * ⚠ `auto_system` VA `feedback_author` BU RO'YXATDA YO'Q — ATAYLAB.
 *
 * Ular TIZIM ichidan (job, feedback servisi) chaqiriladi va `resolveAudience`
 * ularni qabul qiladi, lekin HTTP orqali yuborib bo'lmaydi:
 *   • `auto_system` filial ko'lamini QO'LLAMAYDI — tashqaridan ochilsa
 *     istalgan filial foydalanuvchisiga xabar yuborish yo'li ochilardi;
 *   • `feedback_author` esa `relatedFeedback` bilan birga ishlaydi.
 * Shuning uchun chegara AYNAN shu yerda, validator darajasida turadi.
 */
const AUDIENCE_TYPES = [
  'all_students',
  'all_teachers',
  'groups',
  'users',
  'individual',
] as const;

const audienceShape = z.object({
  type: z.enum(AUDIENCE_TYPES),
  groupIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional(),
});

export const idSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const recipientListSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const inboxListSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
    unreadOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => v === true || v === 'true')
      .optional(),
  }),
});

export const listSchema = z.object({
  query: z.object({
    senderId: z.string().optional(),
    category: z.enum(CATEGORIES).optional(),
    channel: z.enum(['inapp', 'telegram']).optional(),
    status: z.enum(['sent', 'scheduled', 'canceled']).optional(),
    search: z.string().optional(),
    fromDate: z.coerce.date().optional(),
    toDate: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),
});

export const sendSchema = z.object({
  body: z.object({
    title: z.string().max(200).optional(),
    body: z.string().max(2000).optional(),
    category: z.enum(CATEGORIES).optional(),
    templateId: z.string().optional(),
    // Yetkazish kanallari — kamida bittasi. Berilmasa eski xulq: ikkalasi.
    channels: z
      .array(z.enum(['inapp', 'telegram']))
      .min(1, 'Kamida bitta kanal tanlang')
      .optional(),
    // Kelajakdagi vaqtga rejalashtirish (ISO sana). Berilmasa — darhol.
    scheduleAt: z.coerce.date().optional(),
    audience: audienceShape,
  }),
});

/** Oluvchi sonini oldindan hisoblash uchun (jonli preview). */
export const previewSchema = z.object({
  body: z.object({
    audience: audienceShape,
  }),
});

export type IdRequest = z.infer<typeof idSchema>;
export type RecipientListRequest = z.infer<typeof recipientListSchema>;
export type InboxListRequest = z.infer<typeof inboxListSchema>;
export type ListRequest = z.infer<typeof listSchema>;
export type SendRequest = z.infer<typeof sendSchema>;
export type PreviewRequest = z.infer<typeof previewSchema>;
