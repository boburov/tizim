import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

/**
 * QO'LDA KIRITILGAN BONUS va JARIMA.
 *
 * NEGA ALOHIDA KOLLEKSIYA (payroll qatori ichida emas):
 * oy qayta hisoblanganda avtomatik qism to'liq qayta yoziladi. Bonus
 * payroll hujjatining ichida turganida shu paytda YO'QOLARDI - aynan shu
 * xato o'qituvchi modulida `recalc()` ning "kind !== group bo'lsa darhol
 * qaytish" qatori bilan chetlab o'tilgan (teacherSalary.service.js:295).
 * Bu yerda muammo tuzilma darajasida yo'q: qayta hisoblash bu
 * kolleksiyaga UMUMAN tegmaydi, faqat yig'indisini o'qiydi.
 *
 * Summa DOIM MUSBAT saqlanadi, ishorani `kind` beradi. Manfiy summa
 * saqlash (o'qituvchi modulidagidek) hisobotlarda "jarima" va "bonus"ni
 * ajratib bo'lmaydigan qilib qo'yardi.
 */
export const STAFF_ADJUSTMENT_KINDS = ["bonus", "penalty"];

const staffPayrollAdjustmentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    kind: { type: String, enum: STAFF_ADJUSTMENT_KINDS, required: true },
    amount: { type: Number, required: true, min: 1 },

    // SABAB MAJBURIY: "nega 200 000 ushlab qolindi?" degan savolga javobsiz
    // jarima ishonchni buzadi.
    reason: { type: String, trim: true, required: true, maxlength: 500 },

    // Hodisa sanasi (kechikkan kun, bayram tadbiri...). Oy qatoriga
    // year/month bo'yicha tushadi, bu esa tafsilot uchun.
    occurredAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

staffPayrollAdjustmentSchema.index({ employee: 1, year: 1, month: 1 });

staffPayrollAdjustmentSchema.plugin(softDeletePlugin);

const StaffPayrollAdjustment = mongoose.model(
  "StaffPayrollAdjustment",
  staffPayrollAdjustmentSchema,
);

export default StaffPayrollAdjustment;
