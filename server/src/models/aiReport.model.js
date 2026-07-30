import mongoose from "mongoose";

// AI HISOBOTI - kunlik / haftalik / oylik.
//
// NEGA SAQLANADI (har so'rovda qayta hisoblanmaydi):
//   1. Hisobot O'TMISHNI tasvirlaydi. Kechagi hisobotni bugun qayta
//      hisoblasak, o'sha paytdan keyin o'zgargan ma'lumot (kechikib
//      kiritilgan davomat, keyin qilingan to'lov) uni jimgina o'zgartiradi -
//      owner esa kecha boshqa raqamni ko'rgan. Bu ishonchni yo'qotadi.
//   2. Trend hisoboti oldingi davr bilan taqqoslanadi - snapshot bo'lmasa
//      taqqoslash mumkin emas.
//   3. LLM narratori (Faza 3) hisobot boshiga bir marta yoziladi va
//      keshlanadi, har ochilishda qayta yozilmaydi.

export const AI_REPORT_PERIODS = ["daily", "weekly", "monthly"];

// Hisobotning bitta bo'limi. Bo'limlar TARTIBI ma'noga ega: owner
// yuqoridan pastga o'qiydi, shuning uchun massiv (obyekt emas).
const sectionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    // "Moliya", "Davomat", "O'quvchilar oqimi"
    title: { type: String, required: true },
    // Bo'limning bir jumlali xulosasi - owner faqat shuni o'qib ketishi mumkin.
    headline: { type: String, default: "" },
    // Ko'rsatkichlar: { label, value, unit, delta, deltaDirection, hint }
    metrics: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Deterministik (yoki LLM) nasr - raqamlarning MA'NOSI.
    narration: { type: String, default: "" },
  },
  { _id: false },
);

const aiReportSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    period: { type: String, enum: AI_REPORT_PERIODS, required: true },

    // Davr kaliti - IDEMPOTENTLIK asosi. Job ikki marta ishga tushsa
    // (qayta urinish, server restart) ikkinchi yozuv unique indeksga
    // uriladi va hisobot ikkilanmaydi.
    //   daily   → "2026-07-29"
    //   weekly  → "2026-W31"
    //   monthly → "2026-07"
    periodKey: { type: String, required: true },

    // Qamrov oralig'i (inklyuziv boshlanish, EKSKLYUZIV tugash - kodbazadagi
    // leftAt/endDate naqshi bilan bir xil).
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    // Owner ko'radigan sarlavha: "29-iyul kunlik hisoboti".
    title: { type: String, required: true },
    // ENG MUHIM MAYDON: butun hisobotning bir paragrafli xulosasi.
    // Ko'p owner faqat shuni o'qiydi - shuning uchun u to'liq va
    // o'zini o'zi tushuntiradigan bo'lishi kerak.
    summary: { type: String, default: "" },

    sections: { type: [sectionSchema], default: [] },

    // Hisobot yopilgan paytdagi ochiq insight kesimi - "o'sha kuni AI
    // nima deganini" tarixda saqlash uchun.
    insightSnapshot: {
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      opportunities: { type: Number, default: 0 },
      impactAtRisk: { type: Number, default: 0 },
    },

    // YOPIQ HALQA: o'tgan davrda bashorat qilinganlarning nechtasi
    // amalga oshdi. "Sizga aytilgan 12 tadan 9 tasi qoldi" - ishonchni
    // qaytaradigan yagona narsa.
    outcomeSnapshot: {
      prevented: { type: Number, default: 0 },
      occurred: { type: Number, default: 0 },
      resolvedByOwner: { type: Number, default: 0 },
    },

    narrationModel: { type: String, default: null },
    engineVersion: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// IDEMPOTENTLIK: bir filial + davr turi + davr kaliti uchun bitta hisobot.
aiReportSchema.index({ branchId: 1, period: 1, periodKey: 1 }, { unique: true });
// Ro'yxat sahifasi: "filialning oxirgi hisobotlari".
aiReportSchema.index({ branchId: 1, period: 1, periodStart: -1 });

aiReportSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AiReport = mongoose.model("AiReport", aiReportSchema);

export default AiReport;
