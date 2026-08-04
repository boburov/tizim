import mongoose from "mongoose";

// Yagona hujjat kaliti. Kvota BUTUN markaz uchun bitta bo'lgani sababli
// bir dona hujjat yetarli; kalit unique - ikkinchi nusxa yaratilib
// hisob ikkiga bo'linib ketmasin.
export const USAGE_KEY = "global";

/**
 * BAND QILINGAN DISK HAJMI - atomik hisoblagich.
 *
 * NEGA agregatsiya YETARLI EMAS: "hozir nechta bayt band?" degan savolga
 * StoredFile bo'yicha $sum javob beradi, lekin u FAQAT O'QISH. Kvota
 * tekshiruvi esa "o'qi -> qaror qil -> yoz" ketma-ketligi bo'lgani uchun
 * ikki so'rov bir vaqtda o'qisa, IKKALASI ham "joy bor" degan javobni
 * oladi va ikkalasi ham yozadi - kvota oshib ketadi (TOCTOU poygasi).
 * Ko'p instansli deploy'da bu kafolatlangan holat.
 *
 * Shuning uchun joy YOZISHDAN OLDIN band qilinadi: bitta hujjatga
 * shartli $inc (findOneAndUpdate) MongoDB'da ATOMIK, ya'ni chegaradan
 * oshiradigan ikkinchi so'rov shu yerda to'xtaydi.
 *
 * Hisoblagich haqiqatdan uzoqlashib qolishi mumkin (masalan jarayon
 * band qilingandan keyin, faylni yozishdan oldin yiqilsa), shuning uchun
 * `reconcile()` uni StoredFile bo'yicha qayta hisoblaydi - u serverning
 * har ishga tushishida chaqiriladi.
 */
const storageUsageSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: USAGE_KEY },
    // Band qilingan baytlar. Fayl o'chirilganda kamayadi.
    usedBytes: { type: Number, required: true, default: 0, min: 0 },
    // Oxirgi qayta hisoblash (drift tuzatilgan) vaqti - diagnostika uchun.
    reconciledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const StorageUsage = mongoose.model("StorageUsage", storageUsageSchema);

export default StorageUsage;
