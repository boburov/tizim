import { FileInterceptor } from '@nestjs/platform-express';
import multer from 'multer';
import { ApiError } from '../../common/errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXCEL/CSV YUKLASH (`middleware/uploadSheet.js` NING EKVIVALENTI).
 *
 * ⚠ 10 MB — 5000 qatorlik xlsx odatda 1 MB atrofida, ya'ni chegara real
 * fayllardan ANCHA KENG, lekin XOTIRANI himoya qiladi.
 *
 * ⚠ DISKKA EMAS, XOTIRAGA: fayl bir marta o'qilib, tahlil qilinadi va
 * TASHLANADI. Diskka yozilsa vaqtinchalik fayllarni tozalash muammosi
 * paydo bo'lardi (jarayon yiqilsa MOLIYAVIY MA'LUMOT diskda qolib
 * ketardi).
 *
 * ⚠ MULTER XATOLARI `ApiError` GA O'GIRILADI — aks holda ular 500 bo'lib
 * ketardi va foydalanuvchi "fayl juda katta" o'rniga "Serverda xatolik"
 * ko'rardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = /\.(xlsx|csv)$/i;

export const UploadSheetInterceptor = FileInterceptor('file', {
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname || '')) {
      return cb(new ApiError(400, "Faqat .xlsx yoki .csv fayl yuklash mumkin"), false);
    }
    cb(null, true);
  },
});

/**
 * ⚠ `fileSize` chegarasi multer ichida `LIMIT_FILE_SIZE` bilan
 * yiqiladi; NestJS uni `MulterError` sifatida ko'taradi. Kontroller
 * faylni OCHIQ tekshiradi (`assertSheet`), shunda xabar Express bilan
 * bir xil bo'ladi.
 */
export const assertSheet = (file: any) => {
  if (!file?.buffer?.length) {
    throw new ApiError(400, "Fayl yuborilmadi yoki bo'sh");
  }
  return file;
};
