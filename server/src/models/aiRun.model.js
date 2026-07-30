import mongoose from "mongoose";

// DVIGATEL ISHGA TUSHISHI JURNALI.
//
// NEGA KERAK: "AI o'zi kuzatib turadi" degan da'voni foydalanuvchi FAQAT
// oxirgi tahlil vaqtini ko'rsa ishonadi. Vaqt ko'rinmasa, dashboard
// yana bir statik sahifa bo'lib qoladi va bir hafta ichida e'tiborsiz
// qolinadi ("bu raqamlar qachondan beri shu?").
//
// Ikkinchi vazifasi - diagnostika. Tungi job jimgina yiqilsa, ochiq
// insight'lar eskirib qoladi, lekin UI da HAMMASI YAXSHI ko'rinadi.
// Bu jurnal "oxirgi muvaffaqiyatli tahlil 3 kun oldin" ni ko'rsatadi.

export const AI_RUN_TRIGGERS = ["nightly", "intraday", "manual"];
export const AI_RUN_STATUSES = ["running", "ok", "failed"];

const aiRunSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    trigger: { type: String, enum: AI_RUN_TRIGGERS, required: true },
    // Qaysi yangilanish darajasi ishlatildi: "fast" (kunduzi, tez
    // detektorlar) yoki "full" (kechasi, hammasi).
    scope: { type: String, enum: ["fast", "full"], default: "full" },

    status: { type: String, enum: AI_RUN_STATUSES, default: "running", index: true },

    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },

    // Detektor bo'yicha statistika: { students: {created, updated, closed,
    // skippedLowConfidence}, finance: {...}, ... }
    stats: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Ishga tushishdan KEYINGI ochiq insight kesimi - UI "bugun 7 yuqori
    // ustuvorlikli vazifa" ni shu yerdan tez oladi (aggregate qilmasdan).
    openHigh: { type: Number, default: 0 },
    openMedium: { type: Number, default: 0 },
    openOpportunities: { type: Number, default: 0 },

    error: { type: String, default: "" },
    engineVersion: { type: String, required: true },
  },
  { timestamps: true },
);

// "Filialning oxirgi ishga tushishi" - eng ko'p so'raladigan so'rov.
aiRunSchema.index({ branchId: 1, startedAt: -1 });
// Eski jurnallar 90 kundan keyin o'zi o'chadi: bu diagnostika ma'lumoti,
// abadiy saqlanishi kerak emas va indeks/joyni bekorga egallaydi.
aiRunSchema.index({ startedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

aiRunSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AiRun = mongoose.model("AiRun", aiRunSchema);

export default AiRun;
