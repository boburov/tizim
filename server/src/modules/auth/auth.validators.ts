import { z } from 'zod';
import { ROLES } from '../../common/constants/permissions.js';
import { isFutureLocalDay } from '../../common/utils/date.js';
import {
  COMP_BASE_TYPES,
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from '../../common/constants/compensation.js';
import {
  openingAmountSchema,
  openingNoteSchema,
} from '../opening-balance/opening-balance.validators.js';

/**
 * `modules/auth/validators/*.js` ning ko'chirmasi — SHAKL AYNAN BIR XIL
 * (`{ body, query, params }`), shunda `details[].path` Express bilan
 * mos chiqadi.
 */

export const loginSchema = z.object({
  body: z.object({
    login: z.string().min(3, 'Login kamida 3 belgidan iborat'),
    password: z.string().min(4, 'Parol kamida 4 belgidan iborat'),
  }),
});

export const updateProfileSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'Ism kerak').max(60).optional(),
    lastName: z.string().min(1, 'Familiya kerak').max(60).optional(),
    phone: z.preprocess(
      (v) => (v === '' || v == null ? undefined : v),
      z.string().min(9, "Telefon noto'g'ri").optional(),
    ),
    birthDate: z.coerce.date().nullable().optional(),
    gender: z.enum(['male', 'female']).nullable().optional(),
  }),
});

export const changePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, 'Joriy parol kerak'),
      newPassword: z.string().min(6, 'Yangi parol kamida 6 belgidan iborat'),
    })
    .refine((b) => b.currentPassword !== b.newPassword, {
      path: ['newPassword'],
      message: "Yangi parol joriy paroldan farq qilishi kerak",
    }),
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

// ═══════════════════════════════════════════════════════════════════════════
// `POST /auth/register-user` — `auth/validators/registerUser.validator.js`
// NING TO'LIQ KO'CHIRMASI.
//
// ⚠ NEGA KEYIN QO'SHILDI: Express marshrutida `validate(registerUserSchema)`
// bor edi, NestJS kontrollerida esa `@Body()` XOM holda servisga
// uzatilardi. Natijada IKKI STEK BOSHQA joyda rad etardi:
//   Express  → 400 `VALIDATION_ERROR` + `details[].path`
//   NestJS   → 400, lekin SERVIS xabari bilan (kod yo'q)
// va bo'sh tana Express'da "firstName Required", NestJS'da esa
// "Noto'g'ri rol" berardi. Ya'ni klient xato maydonni KO'RSATA olmasdi.
//
// ⚠ `superRefine` SHOXLARI AYNAN KO'CHIRILDI: o'quvchida `enrolledAt`,
// o'qituvchida `hiredAt` MAJBURIY va ikkalasi ham KELAJAKDA bo'lmasligi
// kerak (maosh/moliya davri o'shalarga bog'lanadi). Rol uchun begona
// maydon yuborilsa ham OCHIQ rad etiladi — jimgina tashlab ketilmaydi.
// ═══════════════════════════════════════════════════════════════════════════

/** gender faqat O'QUVCHI uchun — o'qituvchida jins so'ralmaydi. */
const STUDENT_ONLY_FIELDS = ['enrolledAt', 'gender'] as const;
const TEACHER_ONLY_FIELDS = ['hiredAt', 'compensation'] as const;

/**
 * ISHGA OLISHDA MAOSH — IXTIYORIY ("keyinroq belgilayman" tugmasi
 * bosilsa umuman yuborilmaydi).
 */
const compensationSchema = z
  .object({
    effectiveFrom: z.coerce.date().optional(),
    baseType: z.enum(COMP_BASE_TYPES as unknown as [string, ...string[]]).optional(),
    baseAmount: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
    variableType: z.enum(COMP_VARIABLE_TYPES as unknown as [string, ...string[]]).optional(),
    variableRate: z.coerce.number().min(0).max(1_000_000_000).optional(),
    percentBase: z.enum(COMP_PERCENT_BASES as unknown as [string, ...string[]]).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.variableType !== 'percent' || (d.variableRate ?? 0) <= 100, {
    message: "Foiz stavkasi 100 dan oshmasligi kerak",
    path: ['variableRate'],
  })
  .refine(
    (d) =>
      (d.baseType && d.baseType !== 'none') ||
      (d.variableType && d.variableType !== 'none'),
    {
      message: "Kamida bitta maosh qismi (fiksa yoki o'zgaruvchi) tanlanishi kerak",
      path: ['baseType'],
    },
  );

export const registerUserSchema = z.object({
  body: z
    .object({
      firstName: z.string().min(1, 'Ism kerak').max(60),
      lastName: z.string().min(1, 'Familiya kerak').max(60),
      username: z.string().min(3, 'Username kamida 3 belgidan iborat').max(40),
      // Telefon IXTIYORIY: bo'sh satr ("") "kiritilmagan" deb qabul qilinadi.
      phone: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.string().min(9, "Telefon noto'g'ri").optional(),
      ),
      password: z.string().min(6, 'Parol kamida 6 belgidan iborat'),
      role: z.enum([ROLES.TEACHER, ROLES.STUDENT] as [string, string]),

      birthDate: z.coerce.date().nullable().optional(),
      gender: z.enum(['male', 'female']).nullable().optional(),

      // Faqat O'QUVCHI
      enrolledAt: z.coerce.date().nullable().optional(),

      // Faqat O'QITUVCHI
      hiredAt: z.coerce.date().nullable().optional(),
      compensation: compensationSchema.optional(),

      // BOSHLANG'ICH QOLDIQ — odam tizimga KIRISHIDAN OLDINGI hisob-kitob.
      //   +X = markaz shu odamga X qarzdor
      //   -X = odam markazga X qarzdor
      // Berilmasa yoki 0 bo'lsa — yozuv umuman yaratilmaydi.
      openingBalance: openingAmountSchema,
      openingBalanceNote: openingNoteSchema,

      // FILIAL. Odatda aktiv filialdan (`x-branch-id`) olinadi, lekin
      // "Barcha filiallar" rejimida aktiv filial YO'Q — o'shanda klient
      // qaysi filialga yozishni OCHIQ yuboradi.
      homeBranchId: z.preprocess(
        (v) => (v === '' || v == null ? undefined : v),
        z.string().length(24, "Filial noto'g'ri").optional(),
      ),
    })
    .superRefine((b: Record<string, unknown>, ctx) => {
      if (b.role === ROLES.TEACHER) {
        for (const f of STUDENT_ONLY_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'quvchi uchun`,
            });
          }
        }
        if (b.hiredAt == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['hiredAt'],
            message: 'Ishga olingan sana majburiy',
          });
        } else if (isFutureLocalDay(b.hiredAt as Date)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['hiredAt'],
            message: "Ishga olingan sana kelajakda bo'lmasin",
          });
        }
      }
      if (b.role === ROLES.STUDENT) {
        for (const f of TEACHER_ONLY_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'qituvchi uchun`,
            });
          }
        }
        if (b.enrolledAt == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['enrolledAt'],
            message: "Ro'yxatga olingan sana majburiy",
          });
        } else if (isFutureLocalDay(b.enrolledAt as Date)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['enrolledAt'],
            message: "Ro'yxatga olingan sana kelajakda bo'lmasin",
          });
        }
      }
    }),
});

export type RegisterUserRequest = z.infer<typeof registerUserSchema>;
