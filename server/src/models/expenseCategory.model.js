import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// CHIQIM KATEGORIYASI - owner boshqaradigan dinamik ro'yxat.
//
// NEGA MODEL, ENUM EMAS: har markazning o'z chiqim turlari bor ("masjid
// ijarasi", "avtobus"), va yangi tur qo'shish uchun deploy kutish real emas.
// ArchiveReason bilan bir xil naqsh: dinamik ro'yxat + hisobotda snapshot.

// BUXGALTERIYA XULQ-ATVORI: kategoriya chiqimning hisobotda QAYERGA
// tushishini hal qiladi. Bu texnik emas, buxgalteriya farqi:
//   operating - joriy oyning xarajati (ijara, kommunal, reklama) → darhol P&L
//   payroll   - maosh (SalaryTransaction avtomatik shu turga tushadi)
//   tax       - soliq va yig'imlar (foyda hisobida alohida ko'rsatiladi)
//   capital   - asosiy vosita (jihoz, katta ta'mir) → BIR OYGA emas, foydali
//               muddat bo'ylab amortizatsiya qilinadi
export const EXPENSE_CATEGORY_KINDS = ["operating", "payroll", "tax", "capital"];

const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    // Mashina kaliti - seed va hisobot guruhlash uchun ("rent", "utilities").
    code: { type: String, trim: true, lowercase: true, default: null },
    kind: {
      type: String,
      enum: EXPENSE_CATEGORY_KINDS,
      default: "operating",
      required: true,
      index: true,
    },
    // FILIAL: null = barcha filiallar uchun umumiy kategoriya (odatiy holat).
    // Faqat bitta filialga xos kategoriya kerak bo'lsa to'ldiriladi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    // Tizim kategoriyasi - o'chirib bo'lmaydi (maosh shunga bog'lanadi).
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Nom takrorlanmasin (filial ichida, o'chirilmaganlar orasida).
expenseCategorySchema.index(
  { branchId: 1, name: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

expenseCategorySchema.plugin(softDeletePlugin);

const ExpenseCategory = mongoose.model("ExpenseCategory", expenseCategorySchema);

export default ExpenseCategory;
