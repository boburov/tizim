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

    // ─────────── NAVBAT (ommaviy import, Redis/BullMQ) ───────────
    //
    // Eski "fayl → commit" oqimi bu maydonlarsiz ishlaydi: u sinxron
    // bajariladi va tarixga faqat YAKUNIY yozuv qo'yadi (status="completed").
    // Yangi jadval oqimi esa avval "queued" yozuvini yaratadi, keyin
    // worker uni yangilab boradi.

    // rows - foydalanuvchi TAHRIRLAGAN qatorlar (jadvaldan kelgan JSON).
    // file - eski oqim (fayldan qayta o'qiladi).
    mode: { type: String, enum: ["file", "rows"], default: "file" },

    status: {
      type: String,
      enum: ["queued", "running", "completed", "failed"],
      default: "completed",
      index: true,
    },
    processed: { type: Number, default: 0 },

    // Yozilishi kerak bo'lgan qatorlar. Redis'da EMAS, Mongo'da saqlanadi:
    // Redis navbati tozalansa ham ish yo'qolmasin va nima yuborilgani
    // audit uchun qolsin. Hajm IMPORT_MAX_ROWS bilan cheklangan.
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Har qator natijasi (client jadvalni shu bo'yicha bo'yaydi).
    results: { type: [mongoose.Schema.Types.Mixed], default: [] },

    // FILIAL KO'LAMI - XAVFSIZLIK UCHUN KRITIK.
    //
    // Worker HTTP so'rovidan TASHQARIDA ishlaydi, ya'ni AsyncLocalStorage
    // konteksti (helpers/branchContext.helper.js) BO'SH bo'ladi. Bo'sh
    // kontekstda branchFilter() `{}` qaytaradi - bu "barcha filiallar"
    // degani. Ya'ni bitta filial direktori boshlagan import worker'da
    // TO'LIQ HUQUQ bilan bajarilardi. Shuning uchun so'rov paytidagi
    // ko'lam shu yerga muzlatiladi va worker uni qayta tiklaydi.
    scope: {
      type: new mongoose.Schema(
        {
          branchId: { type: mongoose.Schema.Types.ObjectId, default: null },
          allowedBranchIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
          canSeeAllBranches: { type: Boolean, default: false },
          // RUXSATLAR ham muzlatiladi. Worker'da req.permissions yo'q,
          // rolni qaytadan o'qish esa NOTO'G'RI bo'lardi: import
          // yuborilgandan keyin roli kengaytirilgan odam navbatdagi
          // ishida yangi huquqni olib qolardi. Ko'lam SO'ROV PAYTIDA
          // qanday bo'lsa - shunday qoladi.
          permissions: { type: [String], default: [] },
        },
        { _id: false },
      ),
      default: () => ({}),
    },

    error: { type: String, default: "" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Tarix ro'yxati: filial + eng yangisi yuqorida.
importJobSchema.index({ branchId: 1, createdAt: -1 });
// Foydalanuvchining ishlab turgan importlari (progress so'rovi).
importJobSchema.index({ user: 1, status: 1, createdAt: -1 });

const ImportJob = mongoose.model("ImportJob", importJobSchema);

export default ImportJob;
