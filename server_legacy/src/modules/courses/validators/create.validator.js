import { z } from "zod";

// Kod BARQAROR mashina kaliti: hisobot va AI qoidalari unga tayanadi,
// shuning uchun format modeldagi bilan AYNAN bir xil cheklanadi.
const code = z
  .string()
  .trim()
  .min(2, "Kod kamida 2 belgi")
  .max(40)
  .regex(/^[a-zA-Z0-9_-]+$/, "Kod faqat lotin harfi, raqam, - va _ dan iborat");

export const createSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1, "Kurs nomi kerak").max(120),
    code,
    level: z.string().trim().max(30).optional(),
    defaultDurationMonths: z
      .union([z.coerce.number().int().min(0).max(120), z.null()])
      .optional(),
    leadDirection: z.union([z.string().min(1), z.null()]).optional(),
  }),
});
