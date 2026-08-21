import multer from "multer";
import path from "node:path";
import env from "../config/env.js";
import ApiError from "../utils/ApiError.js";
import { formatBytes } from "../modules/storage/services/storage.service.js";

/**
 * RUXSAT ETILGAN FAYL TURLARI - OQ RO'YXAT.
 *
 * Ilgari bu QORA ro'yxat edi (.exe, .bat, .sh, ...). Qora ro'yxat har doim
 * teshik qoldiradi va bu yerda teshiklar jiddiy edi:
 *
 *   .php .phtml .php5 .cgi .pl .py .jsp .asp  - serverda BAJARILADIGAN kod.
 *       Bugun `uploads/` papkasi statik berilmaydi, lekin ertaga nginx
 *       sozlamasidagi bitta qator yoki noto'g'ri `try_files` uni ochib
 *       qo'yishi mumkin - va o'sha lahzada bu RCE bo'ladi.
 *   .html .htm .svg .xhtml                    - saqlangan XSS. SVG ichida
 *       <script> yashaydi va u rasm sifatida ochiladi.
 *   .hta .jse .wsf .msc .cpl .reg .lnk .scf .url .iso  - Windows'da
 *       bajariladigan/avtomatik ochiladigan turlar.
 *   KENGAYTMASIZ fayl                         - qora ro'yxatdan bemalol
 *       o'tardi (`path.extname` bo'sh satr qaytaradi).
 *
 * Shuning uchun qoida TESKARI: faqat o'quv materiali bo'la oladigan
 * turlar o'tadi, qolgan HAMMASI rad etiladi. Yangi tur kerak bo'lsa -
 * shu ro'yxatga ONGLI ravishda qo'shiladi.
 *
 * Qiymat - shu kengaytma uchun ruxsat etilgan MIME turlari. Client
 * yuborgan MIME'ga ISHONMAYMIZ (uni istalgancha yozish mumkin), lekin u
 * kengaytmaga ZID bo'lsa - bu ochiq aldash belgisi, rad etamiz.
 */
const ALLOWED_TYPES = new Map([
  // Hujjatlar
  [".pdf", ["application/pdf"]],
  [".doc", ["application/msword"]],
  [
    ".docx",
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ],
  [".xls", ["application/vnd.ms-excel"]],
  [
    ".xlsx",
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ],
  [".ppt", ["application/vnd.ms-powerpoint"]],
  [
    ".pptx",
    [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  ],
  [".txt", ["text/plain"]],
  [".csv", ["text/csv", "application/csv", "text/plain"]],
  // Rasmlar (SVG ATAYLAB YO'Q - u ichida skript saqlaydigan hujjat)
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".webp", ["image/webp"]],
  [".gif", ["image/gif"]],
  [".heic", ["image/heic", "image/heif"]],
  // Ovoz (o'qituvchi talaffuz namunasi yuboradi)
  [".mp3", ["audio/mpeg", "audio/mp3"]],
  [".m4a", ["audio/mp4", "audio/x-m4a", "audio/m4a"]],
  [".ogg", ["audio/ogg", "application/ogg"]],
  [".wav", ["audio/wav", "audio/x-wav", "audio/wave"]],
  // Video (chegara 5 MB bo'lgani uchun amalda qisqa lavha)
  [".mp4", ["video/mp4"]],
]);

/**
 * FAYL BOSHIDAGI IMZO (magic bytes).
 *
 * Kengaytma ham, MIME ham foydalanuvchi YOZADIGAN narsa: `shell.php` ni
 * `dars.pdf` deb nomlab, MIME'ni `application/pdf` qilib yuborish - bir
 * qator kod. Imzo esa fayl MAZMUNIDA turadi va uni almashtirib bo'lmaydi.
 *
 * Faqat imzosi ANIQ turlar tekshiriladi. Matnli turlar (.txt/.csv) uchun
 * imzo yo'q - ular baribir zararsiz matn va bajarilmaydi.
 *
 * `offset` - imzo boshlanadigan joy (mp4'da `ftyp` 4-baytdan boshlanadi).
 */
const SIGNATURES = new Map([
  [".pdf", [{ bytes: [0x25, 0x50, 0x44, 0x46] }]], // %PDF
  [".png", [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }]],
  [".jpg", [{ bytes: [0xff, 0xd8, 0xff] }]],
  [".jpeg", [{ bytes: [0xff, 0xd8, 0xff] }]],
  [".gif", [{ bytes: [0x47, 0x49, 0x46, 0x38] }]], // GIF8
  [".webp", [{ bytes: [0x52, 0x49, 0x46, 0x46] }]], // RIFF
  [".mp4", [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]], // ....ftyp
  [".m4a", [{ bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }]],
  [".ogg", [{ bytes: [0x4f, 0x67, 0x67, 0x53] }]], // OggS
  [".wav", [{ bytes: [0x52, 0x49, 0x46, 0x46] }]], // RIFF
  [
    ".mp3",
    [
      { bytes: [0x49, 0x44, 0x33] }, // ID3 tegli
      { bytes: [0xff, 0xfb] }, // tegsiz freym
      { bytes: [0xff, 0xf3] },
      { bytes: [0xff, 0xf2] },
    ],
  ],
  // OOXML hujjatlari - aslida ZIP arxivi.
  [".docx", [{ bytes: [0x50, 0x4b, 0x03, 0x04] }]],
  [".xlsx", [{ bytes: [0x50, 0x4b, 0x03, 0x04] }]],
  [".pptx", [{ bytes: [0x50, 0x4b, 0x03, 0x04] }]],
  // Eski Office - OLE2 konteyner.
  [".doc", [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }]],
  [".xls", [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }]],
  [".ppt", [{ bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] }]],
]);

export const extensionOf = (name) =>
  path.extname(String(name || "")).toLowerCase();

const matchesSignature = (buffer, { bytes, offset = 0 }) => {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
};

/**
 * Fayl mazmuni kengaytmasiga mos keladimi.
 * Imzosi ro'yxatda bo'lmagan turlar uchun har doim `true`.
 */
export const contentMatchesExtension = (buffer, ext) => {
  const variants = SIGNATURES.get(ext);
  if (!variants) return true;
  if (!buffer?.length) return false;
  return variants.some((v) => matchesSignature(buffer, v));
};

// Ruxsat etilgan kengaytmalar - xato xabarida foydalanuvchiga ko'rsatiladi.
export const allowedExtensions = () => [...ALLOWED_TYPES.keys()];

/**
 * Fayl nomidan KANONIK MIME turi.
 *
 * Yuklashda saqlangan `mimeType` - client YOZGAN qiymat. Uni brauzerga
 * qaytarish kerak emas: eski (bu tekshiruvlargacha yuklangan) fayllarda
 * u istalgan narsa bo'lishi mumkin. Kengaytma esa saqlashda
 * `safeExtension` orqali tozalangan, ya'ni ishonchli manba.
 */
export const canonicalMimeOf = (name) =>
  ALLOWED_TYPES.get(extensionOf(name))?.[0] || "application/octet-stream";

// Diskka EMAS, xotiraga o'qiymiz: kvota tekshiruvi fayl TO'LIQ kelgandan
// keyin bo'ladi va rad etilgan fayl diskda iz qoldirmasligi kerak.
// MAX_UPLOAD_BYTES odatda 5 MB - bu xotira uchun xavfsiz o'lcham.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 1, fields: 20 },
  // fileFilter oqim BOSHIDA ishlaydi: taqiqlangan tur bo'lsa fayl tanasi
  // umuman o'qilmaydi. VPS uchun aynan shu muhim - rad etish uchun 5 MB
  // ni oxirigacha yutib olish shart emas.
  fileFilter: (_req, file, cb) => {
    const ext = extensionOf(file.originalname);
    if (!ALLOWED_TYPES.has(ext)) {
      return cb(
        new ApiError(
          400,
          `Bu turdagi faylni yuklash mumkin emas. Ruxsat etilgan turlar: ${allowedExtensions().join(", ")}`,
          { code: "FILE_TYPE_NOT_ALLOWED" },
        ),
      );
    }
    // MIME kengaytmaga ZID bo'lsa - ochiq aldash belgisi.
    // Ba'zi brauzerlar noma'lum turni `application/octet-stream` deb
    // yuboradi, shuning uchun u BETARAF sifatida o'tkaziladi - haqiqiy
    // tekshiruv baribir imzo bo'yicha, quyida.
    const mime = String(file.mimetype || "").toLowerCase();
    const allowedMimes = ALLOWED_TYPES.get(ext);
    if (mime && mime !== "application/octet-stream" && !allowedMimes.includes(mime)) {
      return cb(
        new ApiError(
          400,
          "Fayl turi nomiga mos kelmayapti",
          { code: "FILE_TYPE_MISMATCH" },
        ),
      );
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
    if (err) {
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
    }

    // MAZMUN TEKSHIRUVI - fayl to'liq kelgandan KEYIN.
    //
    // multer'ning fileFilter'i faqat METAMA'LUMOTni ko'radi (nom va MIME),
    // ikkalasini ham yuboruvchi yozadi. Haqiqiy himoya shu yerda: `.pdf`
    // deb nomlangan skript birinchi baytlaridayoq fosh bo'ladi.
    if (req.file?.buffer?.length) {
      const ext = extensionOf(req.file.originalname);
      if (!contentMatchesExtension(req.file.buffer, ext)) {
        // Bufer xotirada - diskka hech narsa yozilmagan, tozalash shart emas.
        return next(
          new ApiError(
            400,
            "Fayl mazmuni kengaytmasiga mos kelmaydi. Faylni qayta saqlab, urinib ko'ring",
            { code: "FILE_CONTENT_MISMATCH" },
          ),
        );
      }
    }

    next();
  });
};

export default uploadAttachment;
