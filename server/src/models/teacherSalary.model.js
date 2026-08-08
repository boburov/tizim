import mongoose from "mongoose";
import {
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from "./teacherCompensation.model.js";

// O'qituvchining bir oy uchun maosh QATORI. Snapshot maydonlar recalc() orqali
// yangilanadi. O'chirilmaydi (softDelete yo'q) - o'quvchi to'lovi modeli kabi.
//
// QATOR TURLARI (kind):
//   group     - GURUHDAN hosila o'zgaruvchi qism (foiz / o'quvchi / soat / guruh).
//               group != null. Har guruh uchun alohida qator.
//   base      - MARKAZ darajasidagi fiksa oylik (mas. 2 mln). group = null,
//               oyiga BITTA qator. Guruhlar soniga BOG'LIQ EMAS - aynan shu
//               sabab u guruh qatoriga qo'shilmaydi (3 guruh → 3x2mln bo'lardi).
//   bonus     - KPI/mukofot (qo'lda, tasdiqdan o'tadi). group = null yoki guruh.
//   deduction - jarima/ushlab qolish. expectedAmount MANFIY bo'ladi.
//   opening   - BOSHLANG'ICH QOLDIQ (tizimdan oldingi hisob-kitob). Import
//               orqali bir marta yaratiladi, expectedAmount ISHORALI:
//               musbat = biz qarzmiz, manfiy = o'qituvchi bizga qarz.
//
//               GURUH MAJBURIY - `deduction`dan farqli o'laroq. Sababi
//               to'lov yo'li: salaryTransaction.create → validateSalaryPayment
//               guruhni talab qiladi (assertGroupActive). Guruhsiz qator
//               ekranda ko'rinardi-yu, uni HECH QACHON to'lab bo'lmasdi.
export const SALARY_KINDS = ["group", "base", "bonus", "deduction", "opening"];

const teacherSalarySchema = new mongoose.Schema(
  {
    // FILIAL (denormalizatsiya): guruhdan meros - chiqim hisobotlari uchun.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // GURUH: kind="group" da MAJBURIY, boshqa turlarda null (markaz darajasi).
    // Validatsiya pre("validate") da - schema-level `required` shart emas.
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true,
    },
    kind: {
      type: String,
      enum: SALARY_KINDS,
      default: "group",
      required: true,
      index: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // Maosh konfiguratsiyasi (qo'lda kiritiladi / carry-forward)
    salaryType: {
      type: String,
      enum: ["fixed", "percent", "mixed"],
      default: "fixed",
    },
    fixedAmount: { type: Number, min: 0, default: 0 },
    percentRate: { type: Number, min: 0, max: 100, default: 0 },
    workStartDate: { type: Date, default: null },
    workEndDate: { type: Date, default: null },

    // ─── YANGI: o'zgaruvchi qism stavkasi (snapshot) ───
    // Stavka qaysi turdan va QAYERDAN kelgani - hisobotda "nega shuncha?"
    // savoliga javob berish uchun saqlanadi (stavka keyin o'zgarsa ham tarix
    // buzilmaydi - StudentPayment.baseFee snapshot'i bilan bir xil mantiq).
    variableType: {
      type: String,
      enum: [...COMP_VARIABLE_TYPES, null],
      default: null,
    },
    variableRate: { type: Number, default: 0 },
    percentBase: {
      type: String,
      enum: [...COMP_PERCENT_BASES, null],
      default: null,
    },
    // Stavka manbai: "period" (guruh ustunligi) | "period_legacy" (eski maydon)
    // | "compensation" (o'qituvchi standarti) | "none".
    rateSource: { type: String, default: "none" },
    compensation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherCompensation",
      default: null,
    },

    // Snapshot (recalc paytida yangilanadi)
    groupRevenue: { type: Number, default: 0 },
    prorationFactor: { type: Number, default: 1 },
    payableDays: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },
    proratedFixed: { type: Number, default: 0 },
    percentAmount: { type: Number, default: 0 },
    // per_student bazasi: proratsiyalangan O'QUVCHI-OY (headcount EMAS).
    // Oy o'rtasida qo'shilgan o'quvchi 0.5 bo'lib sanaladi - aks holda
    // oxirgi kuni qo'shilgan o'quvchi uchun to'liq 50k to'lanardi.
    studentUnits: { type: Number, default: 0 },
    perStudentAmount: { type: Number, default: 0 },
    // per_lesson_hour bazasi: shu oyda O'TIB BO'LGAN dars soatlari.
    lessonHours: { type: Number, default: 0 },
    perHourAmount: { type: Number, default: 0 },
    // per_group: guruh uchun qat'iy summa (proratsiyalangan).
    perGroupAmount: { type: Number, default: 0 },

    baseEarnings: { type: Number, default: 0 },
    // DIQQAT: kind="deduction" da MANFIY bo'lishi mumkin - shuning uchun
    // min: 0 QO'YILMAGAN.
    expectedAmount: { type: Number, required: true, default: 0 },

    // BOSHLANG'ICH QOLDIQ - tizimdan OLDINGI hisob-kitob (import paytida
    // OpeningBalance'dan yaratiladi). Har doim kind="opening", ishorasi
    // expectedAmount'da:
    //   expectedAmount > 0 → BIZ o'qituvchiga qarzmiz (to'lanadi)
    //   expectedAmount < 0 → U bizga qarz (keyingi oylikdan ayriladi)
    //
    // recalc() bu qatorlarga TEGMAYDI (u kind!=="group" da darhol
    // qaytadi) va qator isLocked=true bilan yaratiladi. Bayroq esa
    // HISOBOT uchun: hisoblangan (billed) maoshdan chiqarilishi shart -
    // bu o'tgan davr xarajati, joriy oyning emas.
    isOpening: { type: Boolean, default: false, index: true },

    // To'langan (SalaryTransaction yig'indisidan keshlanadi)
    paidAmount: { type: Number, default: 0 },
    // expectedAmount keyinchalik (retro chegirma/fee o'zgarishi) kamayib,
    // to'langan summa undan oshib qolsa - farq shu yerda KO'RINADIGAN bo'lib
    // saqlanadi (clamp bilan yashirilmaydi, clawback uchun asos).
    overpaidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
      index: true,
    },

    // ─── QULF (yopilgan davr) ───
    //
    // Qulflangan qator HECH QANDAY avtomatik qayta hisobdan o'zgarmaydi:
    // na stavka o'zgarishidan, na guruh narxidan, na ishga olingan sana
    // tuzatilishidan. Uni o'zgartirish uchun avval ATAYLAB qulf ochiladi.
    //
    // NEGA KERAK: markaz boshqa tizimdan ko'chib kelganda yoki HR
    // ma'lumoti keyin tuzatilganda o'tgan oylarning MOLIYAVIY yozuvi
    // qayta yozilib ketardi - egasi buni sezmasdi ham. Mavjud `lockPaid`
    // himoyasi faqat TO'LANGAN qatorlarga va faqat stavka o'zgarishiga
    // tegishli edi.
    //
    // Default `false` - mavjud hujjatlar va hisob-kitob AYNAN avvalgidek
    // ishlashda davom etadi.
    isLocked: { type: Boolean, default: false, index: true },
    lockedAt: { type: Date, default: null },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    source: { type: String, enum: ["auto", "manual"], default: "auto" },
    // bonus/deduction uchun: nima uchun berilgani (KPI izohi).
    reason: { type: String, trim: true, default: "" },
    // bonus/deduction tasdiq orqali yaratilgan bo'lsa - qaysi so'rovdan.
    approvalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Approval",
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recalculatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// kind="group" da guruh MAJBURIY; qolganlarida guruhsiz (markaz darajasi)
// bo'lishi MUMKIN. Bu schema-level `required` bilan ifodalab bo'lmaydi.
teacherSalarySchema.pre("validate", function (next) {
  if (this.kind === "group" && !this.group) {
    return next(new Error("Guruh qatori uchun guruh ko'rsatilishi shart"));
  }
  if (this.kind === "opening" && !this.group) {
    return next(
      new Error("Boshlang'ich qoldiq qatori uchun guruh ko'rsatilishi shart"),
    );
  }
  if (this.kind === "base" && this.group) {
    return next(new Error("Fiksa (base) qatori guruhga bog'lanmaydi"));
  }
  next();
});

// ─── UNIKALLIK ───
// Eski yagona indeks ({teacher,group,year,month}) ikkiga bo'lindi, chunki
// `group: null` bo'lgan hujjatlar oddiy unique indeksda BIR-BIRIGA to'qnashardi
// (MongoDB null'ni ham qiymat deb sanaydi) - ya'ni bir o'qituvchida base va
// bonus qatori birga tura olmasdi.
//
// 1) Guruh qatorlari: guruh + oy + tur bo'yicha bitta.
teacherSalarySchema.index(
  { teacher: 1, group: 1, year: 1, month: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { group: { $type: "objectId" } },
  },
);
// 2) Markaz (guruhsiz) qatorlari: oyiga bitta base.
//    bonus/deduction bir oyda BIR NECHTA bo'lishi mumkin (har biri alohida
//    KPI) - shuning uchun indeks faqat "base" bilan cheklangan.
teacherSalarySchema.index(
  { teacher: 1, year: 1, month: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { group: null, kind: "base" },
  },
);
// Hisobotlar uchun
teacherSalarySchema.index({ year: 1, month: 1, status: 1 });

const TeacherSalary = mongoose.model("TeacherSalary", teacherSalarySchema);

export default TeacherSalary;
