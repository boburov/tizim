import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";
import {
  COMP_VARIABLE_TYPES,
  COMP_PERCENT_BASES,
} from "./teacherCompensation.model.js";

// O'qituvchining bir guruhda dars bergan KUN-darajali MAOSH davri - MANBA HAQIQATI.
// Group.teachers[] (tarixsiz massiv) o'rnini bosadi. startDate majburiy;
// endDate=null → hozir ham dars bermoqda (EXCLUSIVE - GroupMembership.leftAt va
// davomat encoding bilan bir xil). (teacher, group) scope ichida faqat bitta
// ochiq davr; bir o'qituvchining davrlari kesishmaydi (period.helper - servisda).
// Turli o'qituvchilar bir vaqtda dars berishi mumkin (scope juftlik bo'yicha).
// Davr o'zida MAOSH stavkasini ham saqlaydi (salaryType/fixedAmount/percentRate) -
// har bir maosh o'zgarishi yangi davr ochadi (oy o'rtasida tur o'zgarishi ham).
const teacherGroupPeriodSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    // EXCLUSIVE tugash sanasi. null → ochiq (davom etayotgan) davr.
    endDate: { type: Date, default: null },

    // ─── STAVKA: USTUNLIK (override), null → o'qituvchi STANDART stavkasi ───
    // Standart TeacherCompensation'da (markaz darajasida, ishga olishda bir
    // marta belgilanadi). Shu yerdagi qiymat FAQAT shu guruh + shu davr uchun
    // uni bekor qiladi ("bu guruhda boshqacha kelishdik").
    //
    // MUHIM (legacy semantikasi): eski `salaryType:"fixed"` GURUH uchun qat'iy
    // summa degani edi (3 guruh → 3 barobar). Yangi modeldagi markaz darajasidagi
    // fiksa oylik BOSHQA narsa - u guruhlar soniga bog'liq emas. Shuning uchun
    // eski "fixed" yangi `per_group` ga tarjima qilinadi (rateResolver).
    variableType: {
      type: String,
      enum: [...COMP_VARIABLE_TYPES, null],
      default: null,
    },
    variableRate: { type: Number, min: 0, default: null },
    percentBase: {
      type: String,
      enum: [...COMP_PERCENT_BASES, null],
      default: null,
    },

    // ─── LEGACY stavka maydonlari (faqat O'QISH uchun) ───
    // Mavjud yozuvlarda qiymat bor - ular USTUNLIK sifatida ishlayveradi
    // (migratsiya shart emas, xulq-atvor o'zgarmaydi). Yangi yozuvlarda null:
    // stavka endi variableType/variableRate yoki standartdan olinadi.
    salaryType: {
      type: String,
      enum: ["fixed", "percent", "mixed", null],
      default: null,
    },
    fixedAmount: { type: Number, min: 0, default: null },
    percentRate: { type: Number, min: 0, max: 100, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

teacherGroupPeriodSchema.index({ group: 1, startDate: 1 });
teacherGroupPeriodSchema.index({ teacher: 1, startDate: 1 });

teacherGroupPeriodSchema.plugin(softDeletePlugin);

const TeacherGroupPeriod = mongoose.model(
  "TeacherGroupPeriod",
  teacherGroupPeriodSchema,
);

export default TeacherGroupPeriod;
