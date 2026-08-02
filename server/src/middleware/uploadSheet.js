import multer from "multer";
import ApiError from "../utils/ApiError.js";

// 10 MB - 5000 qatorlik xlsx odatda 1 MB atrofida bo'ladi, shuning uchun
// bu chegara real fayllardan ancha keng, lekin xotirani himoya qiladi.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = /\.(xlsx|csv)$/i;

// Diskka EMAS, xotiraga yozamiz: fayl bir marta o'qilib, tahlil qilinadi
// va tashlanadi. Diskka yozilsa vaqtinchalik fayllarni tozalash muammosi
// paydo bo'lardi (jarayon yiqilsa moliyaviy ma'lumot diskda qolib ketardi).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_EXT.test(file.originalname || "")) {
      return cb(new ApiError(400, "Faqat .xlsx yoki .csv fayl yuklash mumkin"));
    }
    cb(null, true);
  },
});

/**
 * Bitta "file" maydonini qabul qiladi va multer xatolarini loyihaning
 * ApiError formatiga o'giradi (aks holda ular 500 bo'lib ketardi).
 */
const uploadSheet = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof ApiError) return next(err);
      if (err?.code === "LIMIT_FILE_SIZE") {
        return next(new ApiError(400, "Fayl juda katta (10 MB dan oshmasin)"));
      }
      return next(new ApiError(400, "Faylni yuklab bo'lmadi"));
    }
    if (!req.file?.buffer?.length) {
      return next(new ApiError(400, "Fayl yuborilmadi yoki bo'sh"));
    }
    next();
  });
};

export default uploadSheet;
