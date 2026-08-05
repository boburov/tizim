import { z } from "zod";

// Ikkalasi ham ixtiyoriy: forma faqat O'ZGARGAN maydonni so'raydi.
// Hech biri berilmasa javob bo'sh obyekt bo'ladi (xato emas).
export const checkAvailabilitySchema = z.object({
  query: z.object({
    phone: z.string().max(30).optional(),
    username: z.string().max(40).optional(),
    // Tahrirlashda: odamning O'Z raqami "band" deb ko'rsatilmasin.
    excludeId: z.string().min(1).optional(),
  }),
});
