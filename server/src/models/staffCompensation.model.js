import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// XODIM MAOSH SHARTNOMASI - sana-amalli, tarix saqlanadi.
//
// NEGA O'QITUVCHINIKIDAN ALOHIDA MODEL:
// TeacherCompensation dars soati, guruh foizi va o'quvchi birligi kabi
// KANALLARDAN iborat - ular resepshin yoki buxgalter uchun ma'nosiz. Undan
// tashqari teacherCompensation.service.js `user.role !== ROLES.TEACHER`
// bo'lsa 400 qaytaradi (assertTeacher) va generateMonth faqat guruhlar
// bo'ylab yuradi - xodim u yerga hech qachon tushmaydi. Mavjud modulni
// kengaytirish o'qituvchi maoshini buzish xavfini tug'dirardi, shuning
// uchun BU MODUL UNGA UMUMAN TEGMAYDI (parallel quriladi).
//
// NEGA ALOHIDA HUJJAT (User ichida maydon emas):
// oylik oshirilganda TARIX saqlanishi shart - martdagi oshirish yanvar
// maoshini qayta yozib yubormasligi kerak. Har o'zgarish yangi hujjat
// ochadi, eskisi effectiveTo bilan yopiladi (TeacherCompensation bilan
// bir xil naqsh).

// FIXED           - faqat qat'iy oylik, KPI hisoblanmaydi
// FIXED_PLUS_KPI  - oylik + avtomatik KPI + qo'lda bonus - jarima
// KPI_ONLY        - oylik yo'q, faqat KPI (masalan sotuv menejeri)
export const STAFF_SALARY_TYPES = ["fixed", "fixed_plus_kpi", "kpi_only"];

export const STAFF_SALARY_TYPE_LABELS = {
  fixed: "Qat'iy oylik",
  fixed_plus_kpi: "Oylik + KPI",
  kpi_only: "Faqat KPI",
};

const staffCompensationSchema = new mongoose.Schema(
  {
    // Indeks pastda: {employee, effectiveFrom} kompozit + ochiq davr
    // uchun unique partial. Bu yerda `index: true` yozilsa takroriy
    // indeks ogohlantirishi chiqadi.
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Maosh qaysi filial chiqimiga tushadi. null = markaz darajasida.
    // O'qituvchi modulida bu maydon bo'sh qolsa qator UMUMAN yaratilmasdi
    // (jimgina yo'qolgan maosh) - bu yerda esa shartnoma yaratilayotganda
    // majburiy tekshiriladi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    salaryType: {
      type: String,
      enum: STAFF_SALARY_TYPES,
      required: true,
      default: "fixed",
    },

    // Oylik summa (butun so'm). kpi_only uchun 0.
    baseAmount: { type: Number, default: 0, min: 0 },

    effectiveFrom: { type: Date, required: true },
    // null = ochiq davr. EXCLUSIVE (shu kundan boshlab amal qilmaydi) -
    // loyihadagi barcha davrlar bilan bir xil qoida.
    effectiveTo: { type: Date, default: null },

    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

staffCompensationSchema.index({ employee: 1, effectiveFrom: -1 });

// Bitta xodimda faqat BITTA ochiq shartnoma bo'lishi mumkin.
staffCompensationSchema.index(
  { employee: 1 },
  {
    unique: true,
    partialFilterExpression: { effectiveTo: null, isDeleted: false },
  },
);

staffCompensationSchema.pre("validate", function normalize(next) {
  if (this.salaryType === "kpi_only") this.baseAmount = 0;
  if (this.effectiveTo && this.effectiveFrom && this.effectiveTo <= this.effectiveFrom) {
    return next(new Error("Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak"));
  }
  next();
});

staffCompensationSchema.plugin(softDeletePlugin);

const StaffCompensation = mongoose.model(
  "StaffCompensation",
  staffCompensationSchema,
);

export default StaffCompensation;
