import { z } from 'zod';

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
