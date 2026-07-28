import { z } from "zod";

// FILIAL + DIREKTOR birga yaratiladi.
// Direktor MAJBURIY: direktorsiz filial - "qorong'i ma'lumot", unga
// owner'dan boshqa hech kim kira olmaydi.
const directorSchema = z.object({
  firstName: z.string().min(1, "Direktor ismi kerak").max(60),
  lastName: z.string().min(1, "Direktor familiyasi kerak").max(60),
  username: z.string().min(3, "Login kamida 3 belgi").max(40),
  password: z.string().min(6, "Parol kamida 6 belgi").max(100),
  phone: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (v === "" ? undefined : v)),
  // Bo'sh bo'lsa "director" roli ishlatiladi (seed qilingan shablon).
  role: z.string().min(1).max(40).optional(),
});

export const createSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Filial nomi kerak").max(120),
    code: z.string().max(10).optional().nullable(),
    address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    expenseApprovalThreshold: z
      .union([z.coerce.number().min(0).max(1_000_000_000), z.null()])
      .optional(),
    director: directorSchema,
  }),
});
