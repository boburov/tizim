import mongoose from "mongoose";

/**
 * XODIM OYLIK MAOSH QATORI (xodim x yil x oy).
 *
 * Yakuniy summa:
 *   finalAmount = fixedAmount + autoKpiTotal + manualBonusTotal - penaltyTotal
 *
 * Uch summa ALOHIDA saqlanadi (bitta "jami" emas): egasi har so'm qayerdan
 * kelganini ko'rishi kerak, va qayta hisoblashda faqat avtomatik qism
 * o'zgaradi - qo'lda kiritilgan bonus/jarima tegilmaydi.
 *
 * softDelete plugin ATAYLAB YO'Q - TeacherSalary'da ham yo'q, va
 * cascadeDelete u yerda `isDeleted` yozmoqchi bo'lib jimgina ishlamay
 * qolgan. Bu yerda qator o'chirilmaydi: xodim arxivlansa maosh tarixi
 * qoladi (hisobot buzilmasin).
 */
export const STAFF_PAYROLL_STATUSES = ["unpaid", "partial", "paid"];

const staffPayrollSchema = new mongoose.Schema(
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
      index: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // --- Shartnoma snapshot'i (hisob qanday chiqqanini tushuntiradi) ---
    salaryType: { type: String, default: "fixed" },
    baseAmount: { type: Number, default: 0 },
    // Ishga kirgan/bo'shagan oyda to'liq oylik berilmaydi.
    prorationFactor: { type: Number, default: 1 },
    payableDays: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },

    // --- Hisoblangan qismlar ---
    fixedAmount: { type: Number, default: 0 },
    autoKpiTotal: { type: Number, default: 0 },
    manualBonusTotal: { type: Number, default: 0 },
    penaltyTotal: { type: Number, default: 0 },
    // Manfiy chiqmaydi: jarima oylikdan katta bo'lsa 0 (qarz keyingi oyga
    // ko'chirilmaydi - bu ataylab, aks holda to'lov mantig'i murakkablashadi
    // va xodim "manfiy maosh" bilan qolardi).
    finalAmount: { type: Number, default: 0 },

    // --- To'lov keshi ---
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: STAFF_PAYROLL_STATUSES,
      default: "unpaid",
      index: true,
    },

    computedAt: { type: Date, default: null },

    // OYNI YOPISH.
    //
    // draft     - raqam hali o'zgarishi mumkin (davomat orqadan
    //             belgilanadi, to'lov keyin kiritiladi);
    // finalized - egasi ko'rib qabul qilgan, endi qayta hisoblash uni
    //             O'ZGARTIRMAYDI.
    //
    // NEGA KERAK: KPI kirish ma'lumotlari orqadan tahrirlanadi. Egasi 3-kuni
    // ko'rgan maosh 10-kuni boshqacha bo'lib qolsa - bu ishonchni yo'qotadi.
    // Yopilgan oyni faqat ataylab (force) qayta ochish mumkin.
    lifecycle: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
      index: true,
    },
    finalizedAt: { type: Date, default: null },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Bitta xodimga bir oyda bitta qator.
staffPayrollSchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });
staffPayrollSchema.index({ year: 1, month: 1, status: 1 });

const StaffPayroll = mongoose.model("StaffPayroll", staffPayrollSchema);

export default StaffPayroll;
