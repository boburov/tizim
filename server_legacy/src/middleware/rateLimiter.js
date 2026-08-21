import rateLimit from "express-rate-limit";

// Soft global limit
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "So'rovlar soni juda ko'p" },
});

// Stricter limit for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});

// FAYL YUKLASH: daqiqasiga 10 ta so'rov.
//
// Umumiy chegara (200/daq) bu yerda YETARLI EMAS: har bir so'rov 5 MB
// gacha tanani xotiraga o'qiydi, ya'ni umumiy chegara doirasida ham
// daqiqasiga ~1 GB trafik va shuncha xotira band qilish mumkin edi.
// Kvota diskni himoyalaydi, lekin xotira va kanalni emas.
//
// 10 ta - jonli ishlash uchun keng: o'qituvchi ketma-ket 10 ta vazifa
// yubormaydi, lekin skript bilan urinish shu yerda to'xtaydi.
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Fayl yuklash urinishlari juda ko'p, biroz kuting",
  },
});

// Telegram WebApp verify endpointi uchun: daqiqasiga 40 ta so'rov
export const botVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});
