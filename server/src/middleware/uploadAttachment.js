import multer from "multer";
import path from "node:path";
import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { formatBytes } from "../modules/storage/services/storage.service.js";

// Bajariladigan fayllar. Telegram ularni baribir cheklaydi, lekin fayl
// avval BIZNING diskda yotadi va platforma ichidan yuklab olinadi -
// shuning uchun filtr shu yerda ham kerak.
const BLOCKED_EXT = new Set([
  ".exe", ".msi", ".bat", ".cmd", ".com", ".scr", ".pif",
  ".sh", ".bash", ".ps1", ".vbs", ".jar", ".apk", ".app", ".deb", ".dmg",
]);

// Diskka EMAS, xotiraga o'qiymiz: kvota tekshiruvi fayl TO'LIQ kelgandan
// keyin bo'ladi va rad etilgan fayl diskda iz qoldirmasligi kerak.
// MAX_UPLOAD_BYTES odatda 5 MB - bu xotira uchun xavfsiz o'lcham.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (BLOCKED_EXT.has(ext)) {
      return cb(new ApiError(400, "Bu turdagi faylni yuklash mumkin emas"));
    }
    cb(null, true);
  },
});

/**
 * Ixtiyoriy "file" maydonini qabul qiladi.
 *
 * uploadSheet'dan farqi: fayl BO'LMASA HAM o'tkazadi. Vazifa faqat matndan
 * iborat bo'lishi mumkin (va kvota to'lganda faqat shu variant qoladi) -
 * fayl yo'qligi xato emas.
 */
const uploadAttachment = (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err?.code === "LIMIT_FILE_SIZE") {
      return next(
        new ApiError(
          413,
          `Fayl juda katta. Bitta fayl uchun chegara: ${formatBytes(
            env.MAX_UPLOAD_BYTES,
          )}`,
          { code: "FILE_TOO_LARGE", details: { maxUploadBytes: env.MAX_UPLOAD_BYTES } },
        ),
      );
    }
    if (err?.code === "LIMIT_FILE_COUNT") {
      return next(new ApiError(400, "Faqat bitta fayl biriktirish mumkin"));
    }
    return next(new ApiError(400, "Faylni yuklab bo'lmadi"));
  });
};

export default uploadAttachment;
