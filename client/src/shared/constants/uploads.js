// RUXSAT ETILGAN FAYL TURLARI.
//
// Server bilan BIR XIL bo'lishi SHART - manba haqiqati o'sha yerda
// (server/src/middleware/uploadAttachment.js). Bu yerdagi ro'yxat faqat
// FOYDALANUVCHI QULAYLIGI uchun: taqiqlangan fayl 5 MB yuklanib, keyin
// serverdan 400 olishdan ko'ra, tanlangan zahoti aytilgani yaxshi.
//
// Bu ro'yxat himoya EMAS: uni brauzerda chetlab o'tish oson va shuning
// uchun haqiqiy tekshiruv (kengaytma + MIME + fayl imzosi) serverda
// turadi. Bu yerga tur qo'shishdan oldin serverga qo'shing.
export const ALLOWED_UPLOAD_EXTENSIONS = Object.freeze([
  // Hujjatlar
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
  // Rasmlar (.svg ATAYLAB YO'Q - u ichida skript saqlaydigan hujjat)
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic",
  // Ovoz
  ".mp3", ".m4a", ".ogg", ".wav",
  // Video
  ".mp4",
]);

// <input type="file" accept="..."> uchun. Bu faqat tanlash oynasidagi
// FILTR - foydalanuvchi uni "Barcha fayllar"ga o'zgartira oladi, shuning
// uchun quyidagi tekshiruv baribir kerak.
export const UPLOAD_ACCEPT = ALLOWED_UPLOAD_EXTENSIONS.join(",");

export const extensionOf = (name) => {
  const dot = String(name || "").lastIndexOf(".");
  return dot === -1 ? "" : String(name).slice(dot).toLowerCase();
};

export const isAllowedUpload = (name) =>
  ALLOWED_UPLOAD_EXTENSIONS.includes(extensionOf(name));

// Xato matni - ro'yxat uzun bo'lgani uchun turkumlab ko'rsatiladi.
export const UPLOAD_TYPES_HINT =
  "Hujjat (pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv), " +
  "rasm (jpg, png, webp, gif, heic), ovoz (mp3, m4a, ogg, wav) yoki mp4";
