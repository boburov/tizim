import rateLimit from 'express-rate-limit';

/**
 * `server/src/middleware/rateLimiter.js` NING KO'CHIRMASI.
 *
 * ⚠ SOZLAMALAR AYNAN BIR XIL BO'LISHI SHART. Ular xavfsizlik chegarasi:
 * `authLimiter` parolni ko'r-ko'rona tanlashni (brute force) to'sadi.
 * NestJS'da bu bo'lmasa, cutover paytida himoya JIMGINA yo'qolardi —
 * marshrutlar ishlab turgani uchun buni hech narsa ko'rsatmasdi.
 *
 * DIQQAT: hisoblagich JARAYONGA XOS. Ikki stek bir vaqtda ishlaganda
 * ularning hisoblagichlari ALOHIDA — ya'ni umumiy chegara ikki barobar.
 * Faza 2 da bu zararsiz (NestJS trafik olmaydi), lekin cutover'dan
 * keyin yagona jarayon qoladi va chegara yana aniq bo'ladi.
 */

/** Umumiy: 200 so'rov / daqiqa. */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "So'rovlar soni juda ko'p" },
});

/** Auth: 20 urinish / 5 daqiqa (login, refresh). */
export const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});

/**
 * Bot `initData` tekshiruvi: 40 urinish / 1 daqiqa.
 *
 * ⚠ `authLimiter` DAN KENGROQ va bu ATAYLAB: mini-ilova ochilganda
 * `/verify` avtomatik chaqiriladi va Telegram ba'zan sahifani qayta
 * yuklaydi. 20/5daq bo'lsa oddiy foydalanuvchi ham chegaraga urilardi.
 * `/login` esa (parol bilan) qat'iy `authLimiter` ostida qoladi.
 */
export const botVerifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Juda ko'p urinish, biroz kuting" },
});

/**
 * Fayl yuklash: 10 urinish / 1 daqiqa.
 *
 * ⚠ TEKSHIRUVLARDAN KEYIN, LEKIN TANANI O'QISHDAN OLDIN ulanadi
 * (`assignments.module.ts`). Chegaraga yetgan so'rov 5 MB ni xotiraga
 * yutmasdan to'xtaydi — VPS uchun aynan shu muhim.
 */
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
