import { z } from 'zod';

/**
 * `server/src/modules/botAuth/validators/*.js` ning ko'chirmasi.
 * ⚠ Xato matnlari ham AYNAN — klient ularni ko'rsatadi.
 */
export const verifySchema = z.object({
  body: z.object({
    initData: z.string().min(10, 'initData kerak'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    login: z.string().min(3, 'Login kamida 3 belgidan iborat'),
    password: z.string().min(4, 'Parol kamida 4 belgidan iborat'),
    initData: z.string().min(10, 'initData kerak'),
  }),
});

export type VerifyRequest = z.infer<typeof verifySchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
