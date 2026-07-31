import mongoose from "mongoose";

// AI REYTING SNAPSHOTI.
//
// NEGA INSIGHT'DAN ALOHIDA MODEL:
//
// Insight - ANOMALIYA: u faqat chegaradan oshganda yaratiladi va yopiladi
// ("bu o'quvchi ketish arafasida"). Reyting esa TARTIB: "eng ko'p to'lovni
// kechiktirgan 10 kishi" har doim mavjud, hatto hech kim chegaradan
// oshmasa ham. Reytingni Insight kolleksiyasidan yig'ish mumkin emas -
// u yerda faqat "muammoli" deb belgilanganlar bor, ya'ni ro'yxat
// ko'pincha BO'SH chiqadi va owner bugungidek nolni ko'radi.
//
// NEGA SNAPSHOT (jonli hisoblash emas): reyting BARCHA o'quvchi bo'yicha
// signal yig'ishni talab qiladi (davomat, to'lov tarixi, qarz - 8 ta
// aggregation). 800 o'quvchida bu ~2 soniya. Har sahifa ochilishida buni
// qaytarish sahifani sekin qiladi va bir xil javobni qayta hisoblaydi.
// Tungi job bir marta yozadi, sahifa tayyor natijani o'qiydi.

export const RANKING_TYPES = Object.freeze([
  "payment_delay", // eng ko'p to'lovni kechiktirganlar
  "absence", // eng ko'p dars qoldirganlar
  "teacher", // o'qituvchilar reytingi (yuqoridan pastga)
]);

// Reyting qatoridagi bitta o'lchov - UI uni "12 dars · ketma-ket 5 ta"
// ko'rinishida ko'rsatadi. Insight factor'idan farqi: bu yerda VAZN yo'q,
// chunki qator ballini emas, KONTEKSTNI tushuntiradi.
const metricSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, default: "" },
    value: { type: Number, default: 0 },
    unit: { type: String, default: "" },
  },
  { _id: false },
);

const rowSchema = new mongoose.Schema(
  {
    rank: { type: Number, required: true },
    subjectType: { type: String, required: true }, // student | teacher
    subjectId: { type: mongoose.Schema.Types.ObjectId, required: true },
    // Nom snapshot: o'quvchi arxivlansa ham reyting o'qiladi.
    label: { type: String, default: "" },
    // Profil sahifasiga havola - owner ismni bosib to'g'ridan-to'g'ri
    // o'sha odamga o'tadi. Backend'da quriladi, chunki subjectType →
    // marshrut moslashuvi bitta joyda turishi kerak.
    href: { type: String, default: "" },
    // [0,1] - tartiblash asosi.
    score: { type: Number, required: true, min: 0, max: 1 },
    severity: { type: String, enum: ["high", "medium", "low"], default: "low" },
    // [0,1] - qancha ma'lumotga tayanadi. UI past ishonchni belgilaydi.
    confidence: { type: Number, default: 1, min: 0, max: 1 },
    metrics: { type: [metricSchema], default: [] },
    // Bir jumlalik xulosa: "3 oydan beri to'lamaydi".
    note: { type: String, default: "" },
  },
  { _id: false },
);

const aiRankingSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    type: { type: String, enum: RANKING_TYPES, required: true },
    generatedAt: { type: Date, default: Date.now },
    // Nechta subyekt ko'rib chiqildi - "800 o'quvchidan eng yomon 10 tasi"
    // deb aytish uchun. Bu son bo'lmasa reyting kontekstsiz qoladi.
    scanned: { type: Number, default: 0 },
    rows: { type: [rowSchema], default: [] },
    // Reyting bo'yicha umumiy son (mas. jami qarz summasi) - sarlavhada
    // ko'rsatiladi.
    totals: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

// Har filial + tur uchun BITTA joriy snapshot. Tarix saqlanmaydi: reyting
// "hozir kim eng yomon" savoliga javob beradi, tarixiy tahlil uchun
// AiReport bor.
aiRankingSchema.index({ branchId: 1, type: 1 }, { unique: true });

const AiRanking = mongoose.model("AiRanking", aiRankingSchema);

export default AiRanking;
