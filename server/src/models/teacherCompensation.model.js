import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'QITUVCHINING STANDART MAOSH STAVKASI - markaz darajasida, sana-amalli.
//
// NEGA KERAK: stavka ilgari FAQAT TeacherGroupPeriod'da yashardi (o'qituvchi x
// guruh x davr). 5 guruhi bo'lgan o'qituvchiga stavkani 5 joyda kiritishga
// to'g'ri kelardi va "ishga olayotganda oyligini bir marta belgilash" mumkin
// emas edi. Endi: shu hujjat - STANDART (default), TeacherGroupPeriod esa
// ixtiyoriy USTUNLIK (override). Davr stavkasi null bo'lsa - shu yerdan meros.
//
// NEGA ALOHIDA HUJJAT (User ichida embedded emas):
// maosh oshirilganda TARIX saqlanishi shart - mart oyidagi oshirish yanvar
// maoshini o'zgartirmasligi kerak. User ichidagi maydon oxirgi qiymatni
// ustiga yozardi va o'tgan oylar recalc bo'lganda tarix qayta yozilardi.
// Shuning uchun har o'zgarish YANGI hujjat ochadi (TeacherGroupPeriod bilan
// bir xil naqsh), eskisi effectiveTo bilan yopiladi.

export const COMP_BASE_TYPES = ["none", "fixed_monthly"];

// O'zgaruvchi (guruhdan hosila) qism turlari:
//   percent          - guruh tushumidan % (mavjud xulq-atvor)
//   per_student      - har bir o'quvchi uchun N so'm (proratsiyalangan o'quvchi-oy)
//   per_lesson_hour  - guruhda o'tilgan har DARS SOATI uchun N so'm
//   per_group        - har bir guruh uchun qat'iy N so'm (oyiga)
export const COMP_VARIABLE_TYPES = [
  "none",
  "percent",
  "per_student",
  "per_lesson_hour",
  "per_group",
];

// Foiz/ulush qaysi bazadan olinadi:
//   billed    - hisoblangan (StudentPayment.expectedAmount) - o'quvchi to'lamasa
//               ham o'qituvchi oladi, yo'qotish markazda (hozirgi xulq-atvor).
//   collected - haqiqatda yig'ilgan (PaymentTransaction.amount) - risk bo'linadi.
// DIQQAT: bu MAOSH SIYOSATI, texnik detal emas. O'zgartirish o'qituvchi bilan
// kelishilgan bo'lishi kerak - shuning uchun tasdiqdan (approval) o'tadi.
export const COMP_PERCENT_BASES = ["billed", "collected"];

const teacherCompensationSchema = new mongoose.Schema(
  {
    // Alohida `index: true` QO'YILMAGAN: pastdagi { teacher, effectiveFrom }
    // kompozit indeksi teacher bo'yicha qidiruvni ham qoplaydi (prefiks qoidasi),
    // ortiqcha indeks esa yozuvni sekinlashtiradi.
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // FILIAL: fiksa (base) qism guruhdan hosila EMAS, shuning uchun uni
    // guruhdan meros qilib bo'lmaydi - chiqim qaysi filialga yozilishini
    // shu maydon hal qiladi. null = markaz umumiy (taqsimlanmagan chiqim).
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    // AMAL QILISH OYNASI. startDate/endDate bilan bir xil semantika:
    // effectiveTo EXCLUSIVE, null → hozir ham amalda (ochiq stavka).
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },

    // ─── (1) FIKSA qism - markaz darajasida, guruhlar soniga BOG'LIQ EMAS ───
    // 2 mln oylik 3 guruhda ishlasa ham 2 mln bo'lib qoladi (6 mln emas).
    // Shuning uchun u guruhga emas, TeacherSalary{kind:"base", group:null}
    // yozuviga tushadi.
    baseType: { type: String, enum: COMP_BASE_TYPES, default: "none" },
    baseAmount: { type: Number, min: 0, default: 0 },

    // ─── (2) O'ZGARUVCHI qism - HAR GURUH uchun alohida hisoblanadi ───
    variableType: {
      type: String,
      enum: COMP_VARIABLE_TYPES,
      default: "none",
    },
    // percent → foiz (0-100); per_student/per_lesson_hour/per_group → so'm.
    variableRate: { type: Number, min: 0, default: 0 },
    percentBase: {
      type: String,
      enum: COMP_PERCENT_BASES,
      default: "billed",
    },

    // Izoh (nega shu stavka - kelishuv/oshirish sababi).
    note: { type: String, trim: true, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Stavka izlash: o'qituvchi bo'yicha, eng yangisi birinchi.
teacherCompensationSchema.index({ teacher: 1, effectiveFrom: -1 });

// Bir o'qituvchida bir vaqtda faqat BITTA ochiq (amaldagi) stavka.
// Aks holda ikki ochiq stavka bo'lsa "qaysi biri amalda?" degan savol
// javobsiz qolardi va recalc noaniq natija berardi.
teacherCompensationSchema.index(
  { teacher: 1 },
  {
    unique: true,
    partialFilterExpression: { effectiveTo: null, isDeleted: false },
  },
);

teacherCompensationSchema.plugin(softDeletePlugin);

// Foiz 100 dan oshmasin; per_* turlarida foiz bazasi ma'nosiz.
teacherCompensationSchema.pre("validate", function (next) {
  if (this.baseType === "none") this.baseAmount = 0;
  if (this.variableType === "none") this.variableRate = 0;
  if (this.variableType === "percent" && this.variableRate > 100) {
    return next(new Error("Foiz stavkasi 100 dan oshmasligi kerak"));
  }
  if (
    this.effectiveTo &&
    new Date(this.effectiveTo).getTime() <= new Date(this.effectiveFrom).getTime()
  ) {
    return next(new Error("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak"));
  }
  // Ikkala qism ham "none" bo'lsa stavka ma'nosiz - jimgina 0 maosh
  // yaratmaslik uchun ochiq rad etamiz.
  if (this.baseType === "none" && this.variableType === "none") {
    return next(new Error("Kamida bitta maosh qismi (fiksa yoki o'zgaruvchi) belgilanishi kerak"));
  }
  next();
});

const TeacherCompensation = mongoose.model(
  "TeacherCompensation",
  teacherCompensationSchema,
);

export default TeacherCompensation;
