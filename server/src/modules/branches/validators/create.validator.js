import { z } from "zod";

// FILIAL + DIREKTOR birga yaratilishi MUMKIN, lekin majburiy emas.
//
// Ilgari direktor majburiy edi ("direktorsiz filial - qorong'i ma'lumot").
// Amalda bu halqa hosil qilardi: yaratilgan har bir filialda darhol 1 ta
// foydalanuvchi paydo bo'lardi, softRemove esa foydalanuvchisi bor filialni
// o'chirishni taqiqlaydi - ya'ni yaratilgan filialni HECH QACHON o'chirib
// bo'lmasdi. Endi avval filialni ochib, direktorni keyin biriktirish mumkin.
const directorSchema = z.object({
  // ISM IXTIYORIY. Tezkor filial ochishda faqat login+parol ma'lum
  // bo'ladi; bo'sh qolgani servisda ko'rinadigan o'rinbosar bilan
  // to'ldiriladi ("Direktor <filial nomi>") - qarang branches.service.js.
  // MAJBURIYLIK LOGIN VA PAROLDA QOLADI: ularsiz hisob ochib bo'lmaydi.
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
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
    // Ixtiyoriy. Bo'sh obyekt ({} yoki hamma maydoni bo'sh) ham "yo'q"
    // deb qabul qilinadi - client forma maydonlarini bo'sh string bilan
    // yuboradi va ular yarim to'ldirilgan direktor yaratmasligi kerak.
    director: z.preprocess((v) => {
      if (!v || typeof v !== "object") return undefined;
      const filled = ["firstName", "lastName", "username", "password"].some(
        (k) => String(v[k] ?? "").trim() !== "",
      );
      return filled ? v : undefined;
    }, directorSchema.optional()),
  }),
});
