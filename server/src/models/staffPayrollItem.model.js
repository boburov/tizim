import mongoose from "mongoose";

/**
 * AVTOMATIK KPI QATORI - "bu pul qayerdan chiqdi" degan savolning javobi.
 *
 * Har qator BITTA hodisaga bog'lanadi (sourceType + sourceId): qaysi lid
 * aylantirildi, qaysi to'lov qabul qilindi, qaysi o'quvchi qoldi. Egasi
 * summани bosib, dalilni ko'ra oladi.
 *
 * TAKROR HISOBLASHDAN HIMOYA: unique {payroll, rule, sourceType, sourceId}.
 * Oy qayta hisoblanganda ayni hodisa uchun yangi qator YARATILMAYDI -
 * mavjudi yangilanadi. Bu qayta hisoblashni xavfsiz (idempotent) qiladi,
 * o'qituvchi modulidagi to'lov yo'lidan farqli (u yerda idempotentlik
 * faqat tasdiq orqali kelgan to'lovlarda bor).
 *
 * DALIL SNAPSHOT: `meta` ichida hodisa tafsiloti nusxa qilinadi. Manba
 * o'chirilishi mumkin (lid hard-delete bo'ladi, o'quvchi o'chirilganda
 * Lead.studentId null qilinadi) - o'shanda ham o'tgan oyning maoshi
 * tushunarli bo'lib qolishi kerak.
 */
const staffPayrollItemSchema = new mongoose.Schema(
  {
    payroll: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffPayroll",
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KpiRule",
      required: true,
    },
    // Qoida nomi/triggeri SNAPSHOT - qoida keyin o'zgartirilsa yoki
    // o'chirilsa ham o'tgan oy qatori o'z nomini saqlaydi.
    ruleName: { type: String, default: "" },
    trigger: { type: String, default: "" },

    // Hodisa manbasi: "lead" | "payment" | "attendance" | "student"
    sourceType: { type: String, required: true },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // HODISANING BARQAROR KALITI - takror to'lovga qarshi yagona himoya.
    //
    // Nega payroll (oy) ichida emas, UMR BO'YI noyob: "bir marta"
    // turidagi mukofot (lid konversiyasi) hodisa oyi siljib qolsa -
    // masalan konversiya sanasi tuzatilsa yoki oy chegarasida qayta
    // hisoblansa - IKKI oyda ikki marta to'lanib ketardi. Kalit oydan
    // qat'i nazar noyob bo'lsa, bu jismonan mumkin emas.
    //
    // Har oy takrorlanadigan yig'ma qatorlar (masalan oylik davomat)
    // kalitiga yil-oyni O'ZI qo'shadi.
    eventKey: { type: String, required: true },

    // per_unit/percent uchun: nechta birlik va birlik qiymati.
    quantity: { type: Number, default: 1 },
    unitAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Bitta hodisa bitta qoida bo'yicha BIR MARTA mukofotlanadi - qaysi oyda
// hisoblanishidan qat'i nazar.
staffPayrollItemSchema.index({ employee: 1, rule: 1, eventKey: 1 }, { unique: true });
staffPayrollItemSchema.index({ employee: 1, year: 1, month: 1 });

const StaffPayrollItem = mongoose.model(
  "StaffPayrollItem",
  staffPayrollItemSchema,
);

export default StaffPayrollItem;
