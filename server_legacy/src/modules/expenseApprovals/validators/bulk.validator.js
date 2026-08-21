import { z } from "zod";

// Ommaviy qaror uchun chegara. Har bir element alohida bajariladi va
// bajaruvchi bazaga yozadi - cheklovsiz ro'yxat bitta so'rovda yuzlab
// tranzaksiyani ishga tushirib, javobni timeout'ga olib borardi.
export const BULK_MAX = 50;

export const bulkSchema = z.object({
  body: z.object({
    ids: z
      .array(z.string().regex(/^[a-f\d]{24}$/i, "Noto'g'ri ID"))
      .min(1, "Kamida bitta so'rov tanlanishi kerak")
      .max(BULK_MAX, `Bir vaqtda ko'pi bilan ${BULK_MAX} ta so'rov`),
    note: z.string().trim().max(500).optional(),
  }),
});
