import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

/**
 * KPI QOIDASI - KONFIGURATSIYA, kod emas.
 *
 * Talab: "resepshin mantig'ini qattiq yozib qo'ymang". Shuning uchun qoida
 * hujjat sifatida saqlanadi va yangi qoida qo'shish = yangi YOZUV, deploy
 * emas. Kodda faqat TRIGGERLAR ro'yxati bor - ular "qaysi hodisalarni
 * o'lchay olamiz" degan savolga javob beradi; "qancha, kimga, qanday
 * shartda" esa shu yerda turadi.
 *
 * conditions - erkin obyekt (Mixed). Har trigger o'zi TUSHUNADIGAN
 * kalitlarni e'lon qiladi (kpiTriggers.js dagi `conditionKeys`), qolgani
 * e'tiborsiz qoladi. Bu qasddan: yangi shart qo'shilganda eski qoidalar
 * migratsiyasiz ishlashda davom etadi.
 */

// Trigger qiymatlari kodda ro'yxatdan o'tadi (kpiTriggers.js), lekin enum
// SHU YERDA - noto'g'ri qiymatli qoida saqlanib qolmasin.
export const KPI_TRIGGERS = [
  // Lid o'quvchiga aylandi (mukofot lidga mas'ul xodimga)
  "lead_converted",
  // Lid o'quvchisi BIRINCHI to'lovni qildi
  "student_first_payment",
  // Lid o'quvchisi belgilangan muddat qatnadi (davomat shartli)
  "student_retained",
  // Xodim qabul qilgan to'lovlar (soni yoki summasi)
  "payments_collected",
  // Xodimning o'z davomati (kelgan kunlari)
  "employee_attendance",
];

// fixed  - har hodisa uchun qat'iy summa (rewardValue so'm)
// per_unit - o'lchov birligi uchun (masalan har bir kelgan kun)
// percent - hodisa summasidan foiz (masalan qabul qilingan to'lovdan 2%)
export const KPI_REWARD_TYPES = ["fixed", "per_unit", "percent"];

const kpiRuleSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, default: "", maxlength: 500 },

    trigger: { type: String, enum: KPI_TRIGGERS, required: true, index: true },

    // Trigger tushunadigan shartlar. Masalan student_retained uchun:
    // { minDays: 30, minAttendanceRate: 80 }
    conditions: { type: mongoose.Schema.Types.Mixed, default: {} },

    rewardType: { type: String, enum: KPI_REWARD_TYPES, required: true, default: "fixed" },
    // fixed/per_unit uchun so'm, percent uchun foiz (0-100).
    rewardValue: { type: Number, required: true, min: 0 },

    // QAYSI ROLLARGA tegishli. Bo'sh massiv = hamma xodimga.
    // Rol QIYMATLARI saqlanadi (Role.value), chunki rollar dinamik -
    // owner istalgan vaqtda "resepshin" yaratishi mumkin.
    applicableRoles: { type: [String], default: [] },

    // null = barcha filiallar.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    // Oyiga maksimal mukofot (0 = cheksiz). Noto'g'ri sozlangan qoida
    // butun byudjetni yeb qo'ymasligi uchun.
    monthlyCap: { type: Number, default: 0, min: 0 },

    enabled: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

kpiRuleSchema.index({ enabled: 1, trigger: 1 });

kpiRuleSchema.pre("validate", function guard(next) {
  if (this.rewardType === "percent" && this.rewardValue > 100) {
    return next(new Error("Foiz stavkasi 100 dan oshmasligi kerak"));
  }
  next();
});

kpiRuleSchema.plugin(softDeletePlugin);

const KpiRule = mongoose.model("KpiRule", kpiRuleSchema);

export default KpiRule;
