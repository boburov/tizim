import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// Fayl qaysi modul uchun yuklangani. Kvota HAMMASI bo'yicha hisoblanadi,
// lekin tozalash/hisobot uchun manbani bilish kerak.
export const FILE_PURPOSES = ["assignment"];

/**
 * Diskdagi faylning metama'lumoti.
 *
 * NEGA ALOHIDA KOLLEKSIYA (vazifa ichiga embed qilinmadi): markazning
 * kvotasi "hozir diskda nechta bayt yotibdi" degan yagona savolga javob
 * bo'lishi kerak. Fayllar bir nechta modulga tarqalib ketsa, bu savolga
 * javob berish uchun har safar hamma kolleksiyani kezish kerak bo'lardi -
 * bitta joyda turgani hisobni ham, tozalashni ham arzonlashtiradi.
 */
const storedFileSchema = new mongoose.Schema(
  {
    // Foydalanuvchi ko'radigan nom (yuklashda qanday bo'lsa - shunday).
    originalName: { type: String, required: true, trim: true },
    // Diskdagi nom - takrorlanmas. Foydalanuvchi nomi ATAYLAB ishlatilmaydi:
    // "../../etc/passwd" kabi nom yo'l chizig'ini buzardi.
    storedName: { type: String, required: true, unique: true },
    // UPLOAD_DIR ga NISBATAN yo'l. Absolut yo'l saqlanmaydi - papka
    // ko'chirilsa (yoki Docker'da mount nuqtasi o'zgarsa) baza buzilmasin.
    relPath: { type: String, required: true },
    mimeType: { type: String, default: "application/octet-stream" },
    // Bayt. Kvota hisobi shu maydon bo'yicha yig'iladi.
    size: { type: Number, required: true, min: 0 },
    purpose: { type: String, enum: FILE_PURPOSES, default: "assignment", index: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Telegram bir marta yuklangan faylni file_id orqali qayta ishlatishga
    // ruxsat beradi. 30 kishilik guruhda bu 30 marta yuklashni 1 martaga
    // tushiradi - trafik ham, yetkazish vaqti ham keskin qisqaradi.
    telegramFileId: { type: String, default: null },
  },
  { timestamps: true },
);

storedFileSchema.plugin(softDeletePlugin);

// Kvota agregatsiyasi: {isDeleted:false} bo'yicha yig'indi.
storedFileSchema.index({ isDeleted: 1, createdAt: -1 });

storedFileSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    // Diskdagi joylashuv - ichki tafsilot. Tashqariga chiqmasin: u bilan
    // faqat server ishlaydi, klient faylni har doim ID orqali so'raydi.
    delete ret.relPath;
    delete ret.storedName;
    return ret;
  },
});

const StoredFile = mongoose.model("StoredFile", storedFileSchema);

export default StoredFile;
