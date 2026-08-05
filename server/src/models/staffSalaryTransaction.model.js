import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

/**
 * XODIMGA MAOSH TO'LOVI (pul chiqishi).
 *
 * SalaryTransaction bilan bir xil tuzilma, lekin ALOHIDA kolleksiya:
 * u `salary` maydonida TeacherSalary'ga ISHORA qiladi va `teacher`
 * maydoni majburiy - xodim qatorini u yerga tiqib bo'lmaydi.
 *
 * Chiqim hisobotida o'qituvchi maoshi bilan YONMA-YON qo'shiladi
 * (financeReport.service.js), Expense yozuvi yaratilmaydi - maosh
 * chiqimi shu yerda qoladi degan qoida modul bo'ylab bir xil
 * (expense.model.js sarlavhasidagi izohga qarang).
 *
 * expenseApprovalId bo'yicha PARTIAL UNIQUE indeks - tasdiqdan o'tgan
 * to'lov faqat BIR MARTA yoziladi (approve tugmasi ikki marta bosilsa
 * ham).
 */
const staffSalaryTransactionSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
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

    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["cash", "card"], required: true },
    paidAt: { type: Date, required: true, index: true },
    note: { type: String, trim: true, default: "" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    expenseApprovalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Approval",
      default: null,
    },
  },
  { timestamps: true },
);

staffSalaryTransactionSchema.index({ year: 1, month: 1, paidAt: 1 });
staffSalaryTransactionSchema.index(
  { expenseApprovalId: 1 },
  {
    unique: true,
    partialFilterExpression: { expenseApprovalId: { $type: "objectId" } },
  },
);

staffSalaryTransactionSchema.plugin(softDeletePlugin);

const StaffSalaryTransaction = mongoose.model(
  "StaffSalaryTransaction",
  staffSalaryTransactionSchema,
);

export default StaffSalaryTransaction;
