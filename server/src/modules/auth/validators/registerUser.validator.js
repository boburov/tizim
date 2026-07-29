import { z } from "zod";
import { ROLES } from "../../../constants/roles.js";
import { isFutureLocalDay } from "../../../helpers/attendance.helper.js";

// gender faqat o'quvchi uchun - o'qituvchida jins so'ralmaydi.
const STUDENT_FIELDS = ["enrolledAt", "gender"];
const TEACHER_FIELDS = ["hiredAt"];

export const registerUserSchema = z.object({
  body: z
    .object({
      firstName: z.string().min(1, "Ism kerak").max(60),
      lastName: z.string().min(1, "Familiya kerak").max(60),
      username: z.string().min(3, "Username kamida 3 belgidan iborat").max(40),
      // Telefon ixtiyoriy: bo'sh string ("") "kiritilmagan" deb qabul qilinadi.
      phone: z.preprocess(
        (v) => (v === "" || v == null ? undefined : v),
        z.string().min(9, "Telefon noto'g'ri").optional(),
      ),
      password: z.string().min(6, "Parol kamida 6 belgidan iborat"),
      role: z.enum([ROLES.TEACHER, ROLES.STUDENT]),

      birthDate: z.coerce.date().nullable().optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),

      // Student-only
      enrolledAt: z.coerce.date().nullable().optional(),

      // Teacher-only
      hiredAt: z.coerce.date().nullable().optional(),

      // FILIAL. Odatda aktiv filialdan (x-branch-id) olinadi, lekin
      // "Barcha filiallar" rejimida aktiv filial YO'Q - o'shanda client
      // qaysi filialga yozishni ochiq yuboradi. Bu maydon bo'lmasa
      // konsolidatsiya ko'rinishidan odam qo'shib bo'lmasdi.
      homeBranchId: z.preprocess(
        (v) => (v === "" || v == null ? undefined : v),
        z.string().length(24, "Filial noto'g'ri").optional(),
      ),
    })
    .superRefine((b, ctx) => {
      if (b.role === ROLES.TEACHER) {
        for (const f of STUDENT_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'quvchi uchun`,
            });
          }
        }
        // Ishga olingan sana o'qituvchi uchun MAJBURIY (maosh davri shunga bog'liq).
        if (b.hiredAt == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["hiredAt"],
            message: "Ishga olingan sana majburiy",
          });
        } else if (isFutureLocalDay(b.hiredAt)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["hiredAt"],
            message: "Ishga olingan sana kelajakda bo'lmasin",
          });
        }
      }
      if (b.role === ROLES.STUDENT) {
        for (const f of TEACHER_FIELDS) {
          if (b[f] !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [f],
              message: `Bu maydon (${f}) faqat o'qituvchi uchun`,
            });
          }
        }
        // Ro'yxatga olingan sana o'quvchi uchun MAJBURIY (a'zolik/moliya davri shunga bog'liq).
        if (b.enrolledAt == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["enrolledAt"],
            message: "Ro'yxatga olingan sana majburiy",
          });
        } else if (isFutureLocalDay(b.enrolledAt)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["enrolledAt"],
            message: "Ro'yxatga olingan sana kelajakda bo'lmasin",
          });
        }
      }
    }),
});
