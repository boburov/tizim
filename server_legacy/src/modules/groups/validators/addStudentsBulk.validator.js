import { z } from "zod";
import { idParam } from "./common.js";

export const addStudentsBulkSchema = z.object({
  params: idParam,
  body: z
    .object({
      studentIds: z
        .array(z.string().min(1))
        .min(1, "Kamida bitta o'quvchi tanlang"),
      // Boshlash sanasi majburiy (default = guruh boshlangan sana, klient yuboradi).
      joinedAt: z.coerce.date({ required_error: "Boshlash sanasi kiritilmagan" }),
      // Tugatgan sana ixtiyoriy: kiritilmasa o'quvchi "o'qimoqda".
      leftAt: z.coerce.date().optional(),
      // Dars to'qnashuviga qaramay baribir qo'shish.
      force: z.boolean().optional().default(false),
    })
    .refine((b) => !b.leftAt || b.leftAt >= b.joinedAt, {
      message: "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      path: ["leftAt"],
    }),
});
