import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// Depozit ledgeri: pul KIRIM (topup), CHIQIM (withdraw), va plan kamayganda
// QAYTARIM (refund - ortiqcha qoplama depozitga qaytadi). Depozit↔plan QOPLAMA
// (apply) bu yerda EMAS - u PaymentTransaction(source:"deposit") da (daromad).
// Bu yozuvlar tizim daromad/xarajatiga KIRMAYDI.
const depositTransactionSchema = new mongoose.Schema(
  {
    // FILIAL: o'quvchining filiali (homeBranchId) bo'yicha.
    //
    // DIQQAT: bu maydon ATAYLAB `required: false`. Depozit yozuvlari
    // o'quvchiga bog'langan, guruhga emas - va o'quvchi hali hech qaysi
    // filialga biriktirilmagan bo'lishi mumkin. required qilinsa, xuddi
    // SalaryTransaction'dagi kabi to'lov butunlay ishlamay qolardi.
    // null = eski yozuv yoki filialsiz o'quvchi (hisobotda "boshqa").
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deposit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentDeposit",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["topup", "withdraw", "refund"],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 1, max: 50_000_000 },
    // Naqd/karta - topup/withdraw uchun. refund (plan→depozit) uchun ahamiyatsiz.
    method: { type: String, enum: ["cash", "card"], default: "cash" },
    // Amaldan keyingi balans (audit/ko'rsatish uchun snapshot).
    balanceAfter: { type: Number, default: 0 },
    note: { type: String, trim: true, default: "" },

    // BOSHLANG'ICH QOLDIQ - tizim ishga tushishida import qilingan avans.
    //
    // Pul bu tizim mavjud bo'lishidan OLDIN kelgan, shuning uchun u
    // "bugungi tushum" emas. paidAt allaqachon o'tgan sanaga qo'yiladi
    // (hisobotlar sana bo'yicha filtrlaydi), lekin ochiq bayroq ham
    // kerak: "bu depozit qayerdan paydo bo'ldi?" degan savolga sana
    // emas, aynan shu maydon javob beradi.
    isOpening: { type: Boolean, default: false, index: true },

    paidAt: { type: Date, required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // TASDIQ orqali yaratilgan bo'lsa - qaysi so'rovdan (aynan bir marta kafolati).
    expenseApprovalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Approval",
      default: null,
    },
  },
  { timestamps: true },
);

depositTransactionSchema.index({ student: 1, paidAt: -1 });

// AYNAN BIR MARTA: bitta tasdiq so'rovidan faqat BITTA tranzaksiya.
depositTransactionSchema.index(
  { expenseApprovalId: 1 },
  {
    unique: true,
    partialFilterExpression: { expenseApprovalId: { $type: "objectId" } },
  },
);

depositTransactionSchema.plugin(softDeletePlugin);

const DepositTransaction = mongoose.model(
  "DepositTransaction",
  depositTransactionSchema,
);

export default DepositTransaction;
