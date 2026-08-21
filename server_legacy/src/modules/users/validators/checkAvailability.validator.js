import { z } from "zod";

// Hammasi ixtiyoriy: forma faqat O'ZGARGAN maydonni so'raydi.
// Hech biri berilmasa javob bo'sh obyekt bo'ladi (xato emas).
//
// `phone` hamon QABUL QILINADI (eski/keshlangan client uni yuborishi
// mumkin), lekin javobga ta'sir qilmaydi - telefon takrorlanishi ruxsat
// etilgan (qarang: user.model.js). Sxemadan olib tashlansa eski client
// 400 xato olardi.
export const checkAvailabilitySchema = z.object({
  query: z.object({
    phone: z.string().max(30).optional(),
    username: z.string().max(40).optional(),
    // Tahrirlashda: odamning O'Z logini "band" deb ko'rsatilmasin.
    excludeId: z.string().min(1).optional(),
  }),
});
