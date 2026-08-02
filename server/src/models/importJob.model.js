import mongoose from "mongoose";

// IMPORT TARIXI. Har bir TASDIQLANGAN import (commit) uchun bitta yozuv.
//
// NEGA kerak: import ommaviy va ORQAGA QAYTARIB BO'LMAYDIGAN amal -
// bir faylda yuzlab to'lov yoziladi. "Kim, qachon, qaysi fayldan, nechta
// qator kiritdi?" savoliga javob bo'lmasa, xato topilganda tekshirish
// mumkin emas. ActivityLog faqat so'rov faktini yozadi, natijani emas.
//
// Ko'rib chiqish (preview) YOZILMAYDI - u hech narsani o'zgartirmaydi va
// jurnalni shovqin bilan to'ldirardi.
const importJobSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    // Reyestrdagi kalit ("student-payments").
    importerKey: { type: String, required: true, index: true },
    fileName: { type: String, trim: true, default: "" },

    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    userName: { type: String, trim: true, default: "" },

    total: { type: Number, default: 0 },
    imported: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    duplicate: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },

    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Tarix ro'yxati: filial + eng yangisi yuqorida.
importJobSchema.index({ branchId: 1, createdAt: -1 });

const ImportJob = mongoose.model("ImportJob", importJobSchema);

export default ImportJob;
