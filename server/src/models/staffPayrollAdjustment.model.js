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
// BOSHLANG'ICH QOLDIQ turlari (import orqali, tizim ishga tushishida):
//   opening_credit - BIZ xodimga qarzmiz (to'lanmagan eski oylik) → qo'shiladi
//   opening_debt   - XODIM bizga qarz (ortiqcha olingan avans)    → ayriladi
//
// NEGA bonus/penalty QAYTA ISHLATILMADI: payroll ekranida "Mukofot:
// 300 000" deb ko'rinardi va bu YOLG'ON - hech kim mukofot bermagan.
// Hisobotda ham eski davr hisob-kitobi joriy oy mukofoti bilan
// aralashib ketardi.
export const STAFF_ADJUSTMENT_KINDS = [
  "bonus",
  "penalty",
  "opening_credit",
  "opening_debt",
];

// Boshlang'ich qoldiq turlari - qayta hisoblash va ko'chirishda ishlatiladi.
export const STAFF_OPENING_KINDS = ["opening_credit", "opening_debt"];

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

    // QAYSI OYDAN KO'CHIRILGAN (faqat opening_debt uchun).
    //
    // Xodimning boshlang'ich qarzi oylik maoshidan katta bo'lsa, bir oyda
    // to'liq ushlab qolib bo'lmaydi (finalAmount manfiy chiqmaydi).
    // Qoldig'i keyingi oyga SHU maydon bilan ko'chiriladi - aks holda pul
    // jimgina yo'qolardi. null = asl (import) qatori.
    carriedFrom: {
      type: new mongoose.Schema(
        { year: { type: Number }, month: { type: Number } },
        { _id: false },
      ),
      default: null,
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

staffPayrollAdjustmentSchema.index({ employee: 1, year: 1, month: 1 });

// BOSHLANG'ICH QOLDIQ: bitta xodimga bitta oyda bitta qator.
//
// Ikki xil takrorlanishdan himoya qiladi:
//  • import ikki marta yuborilsa (OpeningBalance unique'idan tashqari ikkinchi to'siq),
//  • ko'chirish (carry-over) ikki marta ishlasa - generateMonth har oy
//    boshida, server qayta yonganida catch-up bilan yana chaqiriladi.
// Ikkinchisi aynan pulni IKKI BARAVAR ushlab qolishga olib kelardi.
staffPayrollAdjustmentSchema.index(
  { employee: 1, year: 1, month: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: {
      kind: { $in: ["opening_credit", "opening_debt"] },
    },
  },
);

staffPayrollAdjustmentSchema.plugin(softDeletePlugin);

const StaffPayrollAdjustment = mongoose.model(
  "StaffPayrollAdjustment",
  staffPayrollAdjustmentSchema,
);

export default StaffPayrollAdjustment;
