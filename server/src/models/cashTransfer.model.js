import mongoose from "mongoose";

export const TRANSFER_STATUSES = Object.freeze({
  IN_TRANSIT: "in_transit", // pul yo'lda
  RECEIVED: "received", // qabul qilindi
  DISPUTED: "disputed", // sanoqda farq chiqdi
  CANCELED: "canceled", // jo'natish bekor qilindi (pul qaytdi)
});

// INKASSATSIYA - filial kassasidan markazga (yoki boshqa filialga) pul
// jo'natish.
//
// ── ASOSIY G'OYA: "YO'LDAGI PUL" ──
// Pul kassadan chiqqan, lekin manzilga yetmagan oraliq holat MAVJUD va u
// ifodalanishi SHART. Aks holda:
//   - jo'natilgan zahoti chegirilsa -> pul hech kimniki bo'lmay qoladi;
//   - qabul qilingandagina chegirilsa -> filial kassasida yo'q pul
//     turgandek ko'rinadi va sanoq har safar kamomad ko'rsatadi.
//
// Shuning uchun `transit` hisobi bor (constants/ledger.js): pul
// jo'natuvchi filialning JAVOBGARLIGIDA, lekin kassada emas.
//
// ── HOLATLAR ──
//   in_transit -> received    (odatiy yo'l)
//   in_transit -> disputed    (sanoqda farq)
//   in_transit -> canceled    (jo'natish bekor, pul kassaga qaytdi)
//
// Qabul qilingan yoki bekor qilingan o'tkazma QAYTA o'zgarmaydi -
// jurnal yozuvlari allaqachon yozilgan.
const cashTransferSchema = new mongoose.Schema(
  {
    fromBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    toBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    // Jo'natilgan summa (jo'natuvchi sanagan).
    amount: { type: Number, required: true, min: 1 },

    // Yetib kelganda QABUL QILUVCHI sanagan summa.
    // null = hali sanalmagan.
    countedOnArrival: { type: Number, default: null, min: 0 },
    // countedOnArrival − amount. Manfiy = yo'lda kam bo'ldi.
    discrepancy: { type: Number, default: null },

    status: {
      type: String,
      enum: Object.values(TRANSFER_STATUSES),
      default: TRANSFER_STATUSES.IN_TRANSIT,
      index: true,
    },

    sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    sentAt: { type: Date, required: true },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    receivedAt: { type: Date, default: null },

    // Qaysi smena yopilishida jo'natilgan (ixtiyoriy).
    shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "Shift", default: null },

    note: { type: String, trim: true, default: "" },
    // Farq bo'lganda tushuntirish - kim javobgar, nima bo'lgan.
    discrepancyNote: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

cashTransferSchema.index({ status: 1, sentAt: -1 });
cashTransferSchema.index({ toBranchId: 1, status: 1 });

// FILIAL O'ZIGA PUL JO'NATA OLMAYDI.
//
// Bunday yozuv jurnalda ikkita bir xil filialli qator hosil qilib,
// filiallararo balansni cheksiz aylanishga tushirardi.
cashTransferSchema.pre("validate", function validateBranches(next) {
  if (String(this.fromBranchId) === String(this.toBranchId)) {
    return next(new Error("Filial o'ziga pul jo'nata olmaydi"));
  }
  return next();
});

const CashTransfer = mongoose.model("CashTransfer", cashTransferSchema);

export default CashTransfer;
