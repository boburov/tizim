import { z } from "zod";
import { idParam } from "./common.js";

export const addStudentSchema = z.object({
  params: idParam,
  body: z
    .object({
      studentId: z.string().min(1, "O'quvchi tanlanmagan"),
      // Boshlash sanasi majburiy (default = guruh boshlangan sana, klient yuboradi).
      joinedAt: z.coerce.date({ required_error: "Boshlash sanasi kiritilmagan" }),
      // Tugatgan sana ixtiyoriy: kiritilmasa o'quvchi "o'qimoqda".
      leftAt: z.coerce.date().optional(),
      // Tasdiq talab qilinganda so'rovchi qoldiradigan izoh (owner ko'radi).
      requestNote: z.string().trim().max(500).optional(),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ["leftAt"],
    }),
});

// ORQAGA SANA TA'SIRINI OLDINDAN KO'RISH (hech narsa saqlamaydi).
// UI qo'shishdan OLDIN shuni chaqirib "necha oy, qancha qarz" ni ko'rsatadi.
export const backdatePreviewSchema = z.object({
  params: idParam,
  query: z
    .object({
      joinedAt: z.coerce.date({ required_error: "Boshlash sanasi kiritilmagan" }),
      leftAt: z.coerce.date().optional(),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ["leftAt"],
    }),
});
