import mongoose from "mongoose";

// CHIQIM TASDIQI: limitdan oshgan chiqim shu yerda "kutilmoqda" bo'lib turadi,
// owner tasdiqlagach haqiqiy tranzaksiya yaratiladi.
//
// NEGA ALOHIDA KOLLEKSIYA (SalaryTransaction'ga status maydoni EMAS):
// TeacherSalary.paidAmount keshlangan summa bo'lib, recalcStatus() uni
// `SUM(amount) WHERE salary=X AND isDeleted != true` bilan qayta hisoblaydi.
// Agar "kutilmoqda" yozuvi o'sha kolleksiyada tursa, u TO'LANGAN deb
// hisoblanardi va 8 ta hisobot aggregation'iga sizib kirardi (financeReport
// 4 ta, deposit 4 ta - ularning hammasi faqat isDeleted bo'yicha filtrlaydi).
// Alohida kolleksiya bu xavfni butunlay yo'q qiladi.

export const APPROVAL_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved", // tasdiqlandi, lekin hali bajarilmadi
  EXECUTED: "executed", // bajarildi - tranzaksiya yaratildi
  REJECTED: "rejected",
  CANCELED: "canceled", // so'rovchi o'zi bekor qildi
  FAILED: "failed", // tasdiqlandi, lekin bajarishda xato (masalan balans yetmadi)
});

export const ALL_APPROVAL_STATUSES = Object.values(APPROVAL_STATUSES);

// Chiqim turlari. Har biri o'z payload'i va bajaruvchi funksiyasiga ega.
export const EXPENSE_KINDS = Object.freeze({
  SALARY_PAYMENT: "salary_payment", // o'qituvchiga maosh
  DEPOSIT_WITHDRAW: "deposit_withdraw", // o'quvchi depozitidan naqd yechish
});

export const ALL_EXPENSE_KINDS = Object.values(EXPENSE_KINDS);

const expenseApprovalSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    kind: { type: String, enum: ALL_EXPENSE_KINDS, required: true, index: true },

    // Chiqim summasi - limit bilan solishtiriladigan qiymat.
    amount: { type: Number, required: true, min: 1 },

    // So'rov paytidagi limit (snapshot). Owner keyin limitni o'zgartirsa ham
    // tarixda "qaysi limit sababli tasdiq so'ralgani" ko'rinib turadi.
    thresholdAtRequest: { type: Number, default: null },

    // BAJARISH UCHUN KERAKLI MA'LUMOT.
    // Erkin obyekt: har `kind` o'z maydonlarini saqlaydi.
    //   salary_payment    -> { salaryId, method, paidAt, note }
    //   deposit_withdraw  -> { studentId, method, paidAt, note }
    //
    // DIQQAT: bu payload'ga KO'R-KO'RONA ISHONILMAYDI. Tasdiqlash paytida
    // barcha biznes qoidalari QAYTA tekshiriladi (maosh qoldig'i, depozit
    // balansi, guruh arxivlanmaganligi) - chunki so'rov va tasdiq orasida
    // holat o'zgargan bo'lishi mumkin.
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Ko'rsatish uchun snapshot (nomlar keyin o'zgarsa ham tarix buzilmasin)
    subjectName: { type: String, default: "" }, // o'qituvchi/o'quvchi ismi
    contextName: { type: String, default: "" }, // guruh nomi yoki izoh

    status: {
      type: String,
      enum: ALL_APPROVAL_STATUSES,
      default: APPROVAL_STATUSES.PENDING,
      required: true,
      index: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestNote: { type: String, trim: true, default: "" },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, default: "" },

    // Bajarilgandan keyin yaratilgan tranzaksiya (audit izi)
    resultTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    executedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true },
);

// Ro'yxat: filial + holat bo'yicha, yangilari birinchi
expenseApprovalSchema.index({ branchId: 1, status: 1, createdAt: -1 });
// "Mening so'rovlarim"
expenseApprovalSchema.index({ requestedBy: 1, createdAt: -1 });

const ExpenseApproval = mongoose.model("ExpenseApproval", expenseApprovalSchema);

export default ExpenseApproval;
