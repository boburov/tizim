import { z } from "zod";
import { scheduleArray } from "./common.js";

// null/"" ni "kiritilmagan" (undefined) deb qabul qiladi - null'ning epoch/0 ga
// coerce bo'lib majburiy tekshiruvni chetlab o'tishining oldini oladi.
const emptyToUndef = (v) => (v === "" || v == null ? undefined : v);

export const createSchema = z.object({
  // Kurs tugash sanasidan boshqa hamma maydon MAJBURIY.
  body: z.object({
    name: z
      .string({ required_error: "Guruh nomini kiriting" })
      .min(2, "Kamida 2 belgidan iborat bo'lishi kerak")
      .max(120, "120 belgidan oshmasligi kerak"),
    // Dars jadvali majburiy - kamida bitta dars kuni.
    schedule: scheduleArray.refine((arr) => (arr?.length ?? 0) >= 1, {
      message: "Kamida bitta dars kuni qo'shing",
    }),
    // Guruhda aynan bitta o'qituvchi (majburiy).
    teachers: z
      .array(z.string().min(1))
      .min(1, "O'qituvchi tanlang")
      .max(1, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin"),
    // Dars boshlanish sanasi majburiy. Bo'sh/noto'g'ri → undefined (majburiy xatosi
    // chiqadi); coerce.date noto'g'ri sanani "Invalid date" bilan bermasligi uchun
    // shu yerda Date'ga aylantiramiz.
    startDate: z.preprocess((v) => {
      if (v === "" || v == null) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    }, z.date({ required_error: "Dars boshlanish sanasini kiriting" })),
    // Kurs tugash sanasi - YAGONA ixtiyoriy maydon (belgilansa kurs avto tugaydi).
    endDate: z.coerce.date().nullable().optional(),
    durationMonths: z.coerce.number().min(0).nullable().optional(),
    // Joriy oy uchun guruh oylik to'lovi (majburiy) - GroupFee shu summa bilan yaratiladi.
    monthlyPrice: z.preprocess(
      emptyToUndef,
      z.coerce
        .number({
          required_error: "Oylik to'lovni kiriting",
          invalid_type_error: "Oylik to'lovni kiriting",
        })
        .int()
        .min(0),
    ),
  }),
});
