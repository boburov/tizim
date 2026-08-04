import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

const assignmentSchema = new mongoose.Schema(
  {
    // Vazifani yuborgan o'qituvchi (yoki owner/xodim).
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "", trim: true },

    // Qaysi guruh(lar)ga. Bir nechta guruh tanlansa ham fayl BITTA -
    // u bir marta yuklanadi va hamma oluvchiga o'sha nusxa ketadi.
    groups: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
    ],

    // Filial ko'lami. Guruhdan SNAPSHOT qilinadi - aks holda ro'yxatni
    // filiallarga ajratish uchun har safar guruhlarga join qilish kerak
    // bo'lardi. Tanlangan guruhlar bitta filialdan bo'lishi shart
    // (service qatlamida tekshiriladi), shuning uchun yagona qiymat yetarli.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    // Biriktirma. Ixtiyoriy: kvota to'lgan bo'lsa ham vazifa faqat matn
    // sifatida ketaverishi kerak - o'qituvchi ishi to'xtab qolmasin.
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },

    // Fayl TOZALASH natijasida olib tashlangan vaqti.
    //
    // Havola (`file`) null qilinadi - aks holda tafsilot sahifasida
    // ishlamaydigan "Yuklab olish" tugmasi turaverardi. Lekin "fayl
    // umuman bo'lmagan" va "fayl bor edi, joy uchun o'chirildi" - ikki
    // xil holat, shuning uchun izi shu maydonda qoladi.
    fileRemovedAt: { type: Date, default: null },

    // Topshirish muddati (ixtiyoriy) - matnga qo'shib yuboriladi.
    dueDate: { type: Date, default: null },

    // Yetkazish hisoblagichlari (recipient hujjatlaridan denormalizatsiya:
    // ro'yxat sahifasida har qator uchun count() qilmaslik uchun).
    recipientsCount: { type: Number, default: 0, min: 0 },
    deliveredCount: { type: Number, default: 0, min: 0 },
    // Botni bloklagan / botga hech qachon kirmagan o'quvchilar soni.
    blockedCount: { type: Number, default: 0, min: 0 },
    noBotCount: { type: Number, default: 0, min: 0 },
    failedCount: { type: Number, default: 0, min: 0 },

    sentAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

assignmentSchema.plugin(softDeletePlugin);

assignmentSchema.index({ sender: 1, sentAt: -1 });
assignmentSchema.index({ groups: 1, sentAt: -1 });

assignmentSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Assignment = mongoose.model("Assignment", assignmentSchema);

export default Assignment;
