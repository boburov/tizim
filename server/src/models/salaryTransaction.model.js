import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'qituvchiga maosh to'lovi (chiqim). Bitta maosh bir nechta tranzaksiyaga
// bo'linishi mumkin (qisman naqd/karta). teacher/group/year/month - hisobot uchun.
const salaryTransactionSchema = new mongoose.Schema(
  {
    // FILIAL (denormalizatsiya): guruhdan meros - chiqim hisobotlari uchun.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    salary: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherSalary",
      required: true,
      index: true,
    },
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
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["cash", "card"], required: true },
    paidAt: { type: Date, required: true, index: true },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // TASDIQ orqali yaratilgan bo'lsa - qaysi so'rovdan.
    // Pastdagi partial unique indeks bilan birga AYNAN BIR MARTA bajarilishini
    // kafolatlaydi: ikki owner bir vaqtda tasdiqlasa yoki jarayon o'rtada
    // o'lib qayta urinsa ham ikkinchi yozuv 11000 xatosiga uriladi.
    expenseApprovalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Approval",
      default: null,
    },
  },
  { timestamps: true },
);

// Kunlik chiqim grafigi uchun
salaryTransactionSchema.index({ year: 1, month: 1, paidAt: 1 });

// AYNAN BIR MARTA: bitta tasdiq so'rovidan faqat BITTA tranzaksiya.
// Partial - null qiymatlar to'qnashmaydi (odatdagi to'lovlarda u null).
// Bu paymentTransaction.idempotencyKey'dagi namunaning aynan o'zi.
salaryTransactionSchema.index(
  { expenseApprovalId: 1 },
  {
    unique: true,
    partialFilterExpression: { expenseApprovalId: { $type: "objectId" } },
  },
);

salaryTransactionSchema.plugin(softDeletePlugin);

const SalaryTransaction = mongoose.model(
  "SalaryTransaction",
  salaryTransactionSchema,
);

export default SalaryTransaction;
