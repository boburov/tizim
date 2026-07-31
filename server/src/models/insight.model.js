import mongoose from "mongoose";
import {
  INSIGHT_KINDS as KINDS,
  INSIGHT_DOMAINS as DOMAINS,
  INSIGHT_STANCES as STANCES,
} from "../modules/ai/insightKinds.js";

export const INSIGHT_SUBJECT_TYPES = [
  "student",
  "teacher",
  "group",
  "lead",
  "course",
  "branch",
];

// Turlar ro'yxati modules/ai/insightKinds.js dan keladi - u yerda har bir
// tur uchun domen/stance/yangilanish darajasi ham belgilangan. Ro'yxatni
// ikki joyda saqlash ularni jimgina ayrilishga olib borardi.
export const INSIGHT_KINDS = KINDS;
export const INSIGHT_DOMAINS = DOMAINS;
export const INSIGHT_STANCES = STANCES;

export const INSIGHT_SEVERITIES = ["high", "medium", "low"];
export const INSIGHT_STATUSES = ["open", "acked", "done", "dismissed", "expired"];

// Bitta hisoblangan faktor - ballning BIR sababi.
//
// Bu "Sabab" matnining MANBASI. LLM sabablarni o'ylab topmaydi: u shu
// massivni o'zbekcha nasrga aylantiradi, xolos. Agar faktor bu yerda
// yo'q bo'lsa, AI u haqda gapira olmaydi.
const factorSchema = new mongoose.Schema(
  {
    // Mashina kaliti: "attendance_drop", "debt_days", "grade_trend".
    key: { type: String, required: true },
    // Owner ko'radigan o'zbekcha nom: "Davomat pasayishi".
    label: { type: String, required: true },
    // Xom qiymat (foiz, kun, ball...) - UI da ko'rsatiladi.
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    // Qiymat birligi: "%", "kun", "ball", "so'm".
    unit: { type: String, default: "" },
    // [0,1] ga normallashtirilgan qiymat - ball shundan hisoblanadi.
    normalized: { type: Number, required: true, min: 0, max: 1 },
    // Shu faktorning vazni (AiConfig'dan olingan snapshot).
    weight: { type: Number, required: true },
    // Umumiy ballga qo'shgan hissasi = normalized * weight. Keshlanadi,
    // chunki UI faktorlarni ta'sir bo'yicha saralaydi va har safar
    // qayta hisoblash kerak emas.
    contribution: { type: Number, required: true },
    // Yo'nalish: bu faktor xavfni oshirdimi ("bad") yoki kamaytirdimi ("good").
    direction: { type: String, enum: ["bad", "good", "neutral"], default: "bad" },
  },
  { _id: false },
);

// "Ishingni ko'rsat" havolasi - Gemini taklif qilgan majburiy qoida.
// Har bir faktor ORQASIDA haqiqiy hujjatlar turishi kerak. UI da bu
// bosiladigan havolaga aylanadi.
const sourceRefSchema = new mongoose.Schema(
  {
    // Qaysi kolleksiya: "Attendance", "Grade", "StudentPayment".
    model: { type: String, required: true },
    // Ko'rsatilgan hujjat ID'lari (namuna - hammasi emas, ko'pi bilan 20 ta).
    ids: [{ type: mongoose.Schema.Types.ObjectId }],
    // Frontend qaysi sahifaga olib borishi kerak.
    // Mas. "/owner/attendance?studentId=...&from=...&to=..."
    href: { type: String, default: "" },
    // Nechta hujjat topilgan (ids qisqartirilgan bo'lishi mumkin).
    total: { type: Number, default: 0 },
  },
  { _id: false },
);

const recommendedActionSchema = new mongoose.Schema(
  {
    // Mashina kaliti - keyinchalik avtomatlashtirish uchun ("call_parent").
    key: { type: String, required: true },
    // Owner ko'radigan matn: "Ota-onaga 48 soat ichida qo'ng'iroq qiling".
    label: { type: String, required: true },
    // Muddat (kun). null = muddatsiz.
    dueInDays: { type: Number, default: null },
  },
  { _id: false },
);

const insightSchema = new mongoose.Schema(
  {
    // FILIAL: insight DOIM aniq bitta filialga tegishli. Cross-branch
    // sizishning oldini olish uchun majburiy va indekslangan.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    subjectType: { type: String, enum: INSIGHT_SUBJECT_TYPES, required: true },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // Nomi snapshot: subyekt o'chsa/o'zgarsa ham tarixiy insight o'qiladi.
    subjectLabel: { type: String, default: "" },
    // Subyekt profiliga havola ("/owner/users/<id>"). buildInsight()
    // subjectType'dan avtomatik quradi (subjectLink.service.js).
    // null = bu tur uchun profil sahifasi yo'q (mas. kurs) - UI ismni
    // bosilmaydigan matn sifatida chizadi.
    subjectHref: { type: String, default: null },

    kind: { type: String, enum: INSIGHT_KINDS, required: true },

    // DOMEN va STANCE - kind'dan keltirib chiqariladi (insightKinds.js),
    // lekin HUJJATDA saqlanadi: "Moliya modulining AI paneli" so'rovi
    // 20 ta kind'ni sanab o'tmasligi kerak, bitta indekslangan tenglik
    // yetarli. Yozishda buildInsight() to'ldiradi.
    domain: { type: String, enum: INSIGHT_DOMAINS, required: true, index: true },
    // risk | watch | opportunity - imkoniyat xavf bilan bir ro'yxatda
    // turmasligi kerak, aks holda owner uni "yana bir muammo" deb o'qiydi.
    stance: { type: String, enum: INSIGHT_STANCES, default: "risk", index: true },

    severity: { type: String, enum: INSIGHT_SEVERITIES, required: true, index: true },

    // Owner ko'radigan sarlavha: "IELTS kursida davomat 12% pasaydi".
    // subjectLabel ("IELTS") o'zi yetarli emas - filial darajasidagi
    // insight'larda subyekt nomi filial nomi bo'lib qoladi va karta
    // "nima bo'lgani" ni aytmaydi.
    title: { type: String, default: "" },

    // Asosiy ball [0,1] - mas. ketish ehtimoli.
    score: { type: Number, required: true, min: 0, max: 1 },

    // ISHONCH [0,1] = dataDensity × recency × signalConsistency.
    // "AI qanchalik ishonchli" EMAS, "menda qancha ma'lumot bor edi".
    // UI qoidasi: < 0.4 bo'lsa ball ko'rsatilmaydi.
    confidence: { type: Number, required: true, min: 0, max: 1 },

    factors: { type: [factorSchema], default: [] },
    sourceRefs: { type: [sourceRefSchema], default: [] },
    recommendedActions: { type: [recommendedActionSchema], default: [] },

    // Kutilayotgan biznes ta'siri - Action Center reytingi shunga tayanadi.
    expectedImpact: {
      // Xavf ostidagi/yutiladigan summa (so'm). Prioritetning asosiy omili.
      amount: { type: Number, default: 0 },
      currency: { type: String, default: "UZS" },
      // Owner ko'radigan matn: "Oyiga ~450 000 so'm daromad xavf ostida".
      label: { type: String, default: "" },
    },

    // Action Center tartibi: impact × score × shoshilinchlik.
    // Saqlanadi (hisoblanmaydi), chunki ro'yxat shu bo'yicha indeks bilan
    // saralanadi - har so'rovda qayta hisoblash sekin bo'lardi.
    priority: { type: Number, default: 0, index: true },

    // LLM yozgan o'zbekcha nasr. null = hali narrate qilinmagan
    // (deterministik shablon ishlatiladi). Kesh: faktorlar o'zgarmasa
    // qayta generatsiya qilinmaydi - narrationHash shu uchun.
    narration: { type: String, default: null },
    narrationHash: { type: String, default: null },
    narrationModel: { type: String, default: null },

    status: {
      type: String,
      enum: INSIGHT_STATUSES,
      default: "open",
      index: true,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acknowledgedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    // Owner "bu noto'g'ri" desa - sababi. Modelni kalibrlash uchun oltin.
    dismissReason: { type: String, default: "" },

    // YOPIQ HALQA: bashorat amalga oshdimi. Tungi job insight yopilgandan
    // keyin 30 kun kuzatadi va o'quvchi haqiqatan ketganini yozadi.
    // Ishonchni qaytaradigan yagona narsa shu.
    outcome: {
      type: String,
      enum: ["pending", "prevented", "occurred", "unknown"],
      default: "pending",
      index: true,
    },
    outcomeCheckedAt: { type: Date, default: null },

    // Qaysi dvigatel versiyasi yaratgan - vaznlar o'zgargach eski
    // insight'larni ajratish uchun.
    engineVersion: { type: String, required: true },
    generatedAt: { type: Date, default: Date.now, index: true },
    // Shu sanadan keyin insight eskirgan hisoblanadi (avto "expired").
    expiresAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

// DEDUP: bir subyekt uchun bir turdagi FAQAT BITTA ochiq insight.
// Partial: yopilgan (done/dismissed/expired) yozuvlar cheklovga kirmaydi,
// shuning uchun tarix saqlanadi va keyingi oy yangi insight ochilaveradi.
// softDelete.plugin.js dagi partial-unique naqshining aynan o'zi.
insightSchema.index(
  { subjectType: 1, subjectId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ["open", "acked"] } } },
);

// Action Center hot path: filial + ochiq + prioritet bo'yicha saralash.
insightSchema.index({ branchId: 1, status: 1, priority: -1 });
// Modul paneli hot path: "Moliya modulining ochiq insight'lari".
insightSchema.index({ branchId: 1, domain: 1, status: 1, priority: -1 });
// Modul ichidagi badge: "shu o'quvchining ochiq insight'lari".
insightSchema.index({ subjectId: 1, status: 1 });
// Yopiq halqa joblari uchun.
insightSchema.index({ outcome: 1, resolvedAt: 1 });

insightSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Insight = mongoose.model("Insight", insightSchema);

export default Insight;
